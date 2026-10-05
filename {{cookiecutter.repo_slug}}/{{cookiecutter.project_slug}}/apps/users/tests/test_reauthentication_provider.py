"""Proving it is you at your provider: the redirect out, and what the adapter makes of the way back."""

import time
from urllib.parse import parse_qs, urlsplit

import pytest
from allauth.core.context import request_context
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.internal.statekit import STATES_SESSION_KEY
from allauth.socialaccount.models import SocialAccount, SocialLogin
from allauth.socialaccount.providers.base.constants import AuthProcess
from allauth.socialaccount.providers.github.provider import GitHubProvider
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory
from django.urls import reverse

from apps.users.adapters.social_account import SocialAccountAdapter
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.reauthentication import proof
from apps.users.reauthentication.forms.prove_with_provider import ProveWithProviderForm
from apps.users.tests.conftest import AUTH_URLCONF, AUTHORIZATION_ENDPOINT, OIDC_PROVIDER_ID, Headless


PROVE_PAGE = f"http://{settings.PARENT_HOST}/auth/prove?next=%2Fprofile%2Femails"


@pytest.fixture
def social_only(client, alice, providers):
    alice.set_unusable_password()
    alice.save()
    SocialAccount.objects.create(user=alice, provider=OIDC_PROVIDER_ID, uid="sub-1")
    SocialAccount.objects.create(user=alice, provider=GitHubProvider.id, uid="2")
    client.force_login(alice)
    return alice


def _prove_with(client, provider, callback_url=PROVE_PAGE):
    client.get(Headless.url("account:current_session"), HTTP_HOST=f"auth.{settings.PARENT_HOST}")
    return client.post(
        reverse("prove_with_provider", urlconf=AUTH_URLCONF),
        {"provider": provider, "callback_url": callback_url, "csrfmiddlewaretoken": client.cookies["csrftoken"].value},
        HTTP_HOST=f"auth.{settings.PARENT_HOST}",
    )


@pytest.mark.django_db
def test_proving_sends_them_to_their_provider_to_be_challenged_again(client, social_only, monkeypatch):
    monkeypatch.setattr(proof.time, "time", lambda: 1_800_000_000.5)

    response = _prove_with(client, OIDC_PROVIDER_ID)

    location = urlsplit(response["Location"])
    query = parse_qs(location.query)
    assert f"{location.scheme}://{location.netloc}{location.path}" == AUTHORIZATION_ENDPOINT
    assert query["prompt"] == ["login"]
    assert query["max_age"] == ["0"]
    state, _ = client.session[STATES_SESSION_KEY][query["state"][0]]
    assert state["data"] == {proof.PROVING_KEY: True, proof.ASKED_AT_KEY: 1_800_000_000}
    assert state["next"] == PROVE_PAGE
    assert state["process"] == AuthProcess.LOGIN
    assert state["headless"] is True


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("provider", "callback_url"),
    [
        (GitHubProvider.id, PROVE_PAGE),
        ("nobody-connected-this", PROVE_PAGE),
        (OIDC_PROVIDER_ID, "https://elsewhere.example/steal"),
    ],
    ids=["cannot-prove", "not-connected", "unsafe-callback"],
)
def test_proving_is_refused_where_it_could_not_prove_anything(client, social_only, provider, callback_url):
    assert _prove_with(client, provider, callback_url).status_code == 400


@pytest.mark.django_db
def test_nobody_signed_out_can_prove_anything(client, db, providers):
    assert _prove_with(client, OIDC_PROVIDER_ID).status_code == 400


def _request(user):
    request = RequestFactory().get("/")
    request.user = user
    request.session = SessionStore()
    return request


def _sociallogin(user, process=AuthProcess.LOGIN, data=None, auth_time=None):
    account = SocialAccount(provider=OIDC_PROVIDER_ID, uid="sub-1", extra_data={"id_token": {"auth_time": auth_time}})
    sociallogin = SocialLogin(user=user, account=account)
    sociallogin.state = {"process": process, "data": data, "next": PROVE_PAGE}
    return sociallogin


def _landing(request, sociallogin):
    with pytest.raises(ImmediateHttpResponse) as raised:
        SocialAccountAdapter().pre_social_login(request, sociallogin)
    location = urlsplit(raised.value.response["Location"])
    return f"{location.netloc}{location.path}", parse_qs(location.query)


@pytest.mark.django_db
def test_a_proof_that_comes_back_fresh_is_recorded_and_goes_back_to_the_prove_page(alice):
    request = _request(alice)
    asked = proof.proving_state()

    page, query = _landing(request, _sociallogin(alice, data=asked, auth_time=time.time()))

    assert page == f"{settings.PARENT_HOST}/auth/prove"
    assert query == {"next": ["/profile/emails"], "proved": ["1"]}
    assert proof.has_proven_who_they_are(request)


@pytest.mark.django_db
def test_a_proof_that_comes_back_stale_is_not_recorded_and_says_so(alice):
    request = _request(alice)
    asked = proof.proving_state()

    _, query = _landing(request, _sociallogin(alice, data=asked, auth_time=asked[proof.ASKED_AT_KEY] - 60))

    assert query["error"] == ["reauthentication_failed"]
    assert not proof.has_proven_who_they_are(request)


@pytest.mark.django_db
def test_an_ordinary_social_login_goes_on_while_the_ladder_admits_everybody(alice):
    assert SocialAccountAdapter().pre_social_login(_request(AnonymousUser()), _sociallogin(alice)) is None


@pytest.mark.django_db
def test_a_social_login_the_ladder_shuts_out_goes_to_the_provider_error_page(alice):
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)

    page, query = _landing(_request(AnonymousUser()), _sociallogin(alice))

    error_page = urlsplit(settings.HEADLESS_FRONTEND_URLS["socialaccount_login_error"])
    assert page == f"{error_page.netloc}{error_page.path}"
    assert query == {"error": ["logins_closed"]}


@pytest.mark.django_db
def test_connecting_is_left_to_the_ladder_that_already_admitted_whoever_is_signed_in(alice):
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)

    assert SocialAccountAdapter().pre_social_login(_request(alice), _sociallogin(alice, AuthProcess.CONNECT)) is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("data", "errors"),
    [
        (
            {"provider": OIDC_PROVIDER_ID, "callback_url": "https://elsewhere.example/steal"},
            {"callback_url": ["That is not a page this site can send you back to."]},
        ),
        (
            {"provider": GitHubProvider.id, "callback_url": "/auth/prove"},
            {"provider": ["You cannot confirm it is you through that provider."]},
        ),
    ],
)
def test_the_form_says_why_it_refuses(social_only, data, errors):
    request = RequestFactory().post("/")
    request.user = social_only

    form = ProveWithProviderForm(data, request=request)

    # allauth reads the request it is handling from its own context, which its middleware sets.
    with request_context(request):
        assert not form.is_valid()
    assert form.errors == errors


@pytest.mark.django_db
def test_somebody_elses_connected_provider_proves_nothing(client, alice, providers):
    mallory = User.objects.create_user(username="mallory", email="mallory@example.test")
    SocialAccount.objects.create(user=mallory, provider=OIDC_PROVIDER_ID, uid="sub-mallory")
    client.force_login(alice)

    assert _prove_with(client, OIDC_PROVIDER_ID).status_code == 400


def test_allauth_still_hears_of_every_social_login_with_what_it_was_given(monkeypatch):
    seen = []
    monkeypatch.setattr(DefaultSocialAccountAdapter, "pre_social_login", lambda self, *args: seen.append(args))
    monkeypatch.setattr(SocialAccountAdapter, "answer_a_proof_or_the_ladder", lambda self, *args: None)
    request, sociallogin = RequestFactory().get("/"), SocialLogin()

    SocialAccountAdapter().pre_social_login(request, sociallogin)

    assert seen == [(request, sociallogin)]
