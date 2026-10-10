"""The gate on allauth's own endpoints, driven through them the way a client calls them."""

import json
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from allauth.account.internal.flows.login import AUTHENTICATION_METHODS_SESSION_KEY
from allauth.account.models import EmailAddress
from allauth.headless.socialaccount.views import RedirectToProviderView as _RedirectToProviderView
from allauth.socialaccount.models import SocialAccount
from allauth.usersessions.models import UserSession
from django.conf import settings
from django.contrib.sessions.backends.db import SessionStore
from django.http import HttpResponse
from django.test import RequestFactory
from django.urls import reverse

from apps.users.models.user import User
from apps.users.reauthentication.gate import REAUTHENTICATION_REQUIRED_HEADER, ProvesWhoTheyAre
from apps.users.reauthentication.proof import SPENT_AT_SESSION_KEY
from apps.users.reauthentication.views.provider_token import ProviderTokenView
from apps.users.reauthentication.views.redirect_to_provider import RedirectToProviderView
from apps.users.tests.conftest import AUTH_URLCONF, AUTHORIZATION_ENDPOINT, OIDC_PROVIDER_ID, PASSWORD, Headless


def _refused(response):
    return response.status_code == 401 and response.get(REAUTHENTICATION_REQUIRED_HEADER) == "1"


def _add_email(headless, email="second@example.test"):
    return headless.call("POST", "account:manage_email", {"email": email})


@pytest.mark.django_db
def test_an_act_is_refused_without_a_proof_and_says_which_gate_stopped_it(headless, signed_in):
    response = _add_email(headless)

    assert _refused(response)
    # allauth's own re-authentication answer, so its flows still say how to prove it.
    assert {"id": "reauthenticate"} in response.json()["data"]["flows"]
    assert not EmailAddress.objects.filter(email="second@example.test").exists()


@pytest.mark.django_db
def test_a_proof_buys_one_act_and_the_next_one_asks_again(headless, signed_in):
    headless.prove()

    first = _add_email(headless, "second@example.test")
    second = _add_email(headless, "third@example.test")

    assert first.status_code == 200
    assert _refused(second)


def _acts(logged, event):
    return [(line["user"], line["act"]) for line in logged if line["event"] == event]


@pytest.mark.django_db
def test_demanding_a_proof_is_written_down_against_the_act_that_asked(headless, signed_in, logged):
    _add_email(headless)

    assert _acts(logged, "reauthentication.demanded") == [(str(signed_in.pk), "ManageEmailView.POST")]
    assert _acts(logged, "reauthentication.spent") == []


@pytest.mark.django_db
def test_spending_a_proof_is_written_down_against_the_act_it_bought(headless, signed_in, logged):
    headless.prove()

    _add_email(headless)

    assert _acts(logged, "reauthentication.spent") == [(str(signed_in.pk), "ManageEmailView.POST")]
    assert _acts(logged, "reauthentication.demanded") == []


@pytest.mark.django_db
def test_a_refusal_shaped_by_its_view_is_still_written_down(client, signed_in, providers, logged):
    _redirect_to_provider(client, "connect")

    assert _acts(logged, "reauthentication.demanded") == [(str(signed_in.pk), "RedirectToProviderView.POST")]


@pytest.mark.django_db
def test_a_wrong_password_proves_nothing(headless, signed_in):
    attempt = headless.call("POST", "account:reauthenticate", {"password": "not-it"})

    assert attempt.status_code == 400
    assert _refused(_add_email(headless))


@pytest.mark.django_db
def test_an_act_refused_for_another_reason_is_refused_first_and_keeps_the_proof(headless, signed_in):
    headless.prove()

    invalid = _add_email(headless, "not-an-address")
    valid = _add_email(headless)

    assert invalid.status_code == 400
    assert REAUTHENTICATION_REQUIRED_HEADER not in invalid
    assert valid.status_code == 200


@pytest.mark.django_db
def test_signing_in_with_a_password_is_itself_a_proof(headless, alice):
    signed_in = headless.call("POST", "account:login", {"username": "alice", "password": PASSWORD})

    assert signed_in.status_code == 200
    assert _add_email(headless).status_code == 200


@pytest.mark.django_db
def test_resending_a_verification_mail_is_not_an_act(headless, signed_in):
    EmailAddress.objects.create(user=signed_in, email="second@example.test", verified=False)

    response = headless.call("PUT", "account:manage_email", {"email": "second@example.test"})

    assert response.status_code == 200


@pytest.mark.django_db
def test_removing_and_making_an_address_primary_are_acts(headless, signed_in):
    EmailAddress.objects.create(user=signed_in, email="second@example.test", verified=True)

    make_primary = headless.call("PATCH", "account:manage_email", {"email": "second@example.test", "primary": True})
    remove = headless.call("DELETE", "account:manage_email", {"email": "second@example.test"})

    assert _refused(make_primary)
    assert _refused(remove)


@pytest.mark.django_db
def test_changing_a_password_is_proved_by_the_current_one_it_demands(headless, signed_in):
    response = headless.call(
        "POST", "account:change_password", {"current_password": PASSWORD, "new_password": "a-whole-new-password"}
    )

    assert response.status_code == 200


def _record_a_social_proof(headless):
    session = headless.client.session
    session[AUTHENTICATION_METHODS_SESSION_KEY] = [
        {"method": "socialaccount", "at": time.time(), "reauthenticated": True}
    ]
    session.save()


@pytest.mark.django_db
def test_setting_a_first_password_is_an_act_and_spends_the_proof(headless, client, alice):
    alice.set_unusable_password()
    alice.save()
    client.force_login(alice)
    password = {"new_password": "a-whole-new-password"}

    refused = headless.call("POST", "account:change_password", password)
    # Nothing to type for an account with no password, so the proof here is the session's own record
    # of a challenge - the shape a provider round trip leaves behind.
    _record_a_social_proof(headless)
    accepted = headless.call("POST", "account:change_password", password)

    assert _refused(refused)
    assert accepted.status_code == 200
    # The act gave the account a password, which would make it no longer look like an act - the proof
    # is spent all the same.
    assert _refused(_add_email(headless))


@pytest.mark.django_db
def test_disconnecting_a_provider_is_an_act(headless, signed_in):
    SocialAccount.objects.create(user=signed_in, provider="github", uid="1")

    response = headless.call("DELETE", "socialaccount:manage_providers", {"provider": "github", "account": "1"})

    assert _refused(response)
    assert SocialAccount.objects.filter(user=signed_in).exists()


def _sessions_of(client, user, *others):
    client.get(Headless.url("account:current_session"), HTTP_HOST=f"auth.{settings.PARENT_HOST}")
    current = UserSession.objects.create(user=user, session_key=client.session.session_key, ip="127.0.0.1")
    created = [
        UserSession.objects.create(user=user, session_key=f"other-session-{index}", ip="127.0.0.1")
        for index in range(len(others))
    ]
    return current, created


@pytest.mark.django_db
def test_signing_out_this_session_is_not_an_act(headless, client, signed_in):
    current, _ = _sessions_of(client, signed_in)

    response = headless.call("DELETE", "usersessions:sessions", {"sessions": [current.pk]})

    # Signed out, which allauth reports as an unauthenticated session rather than a refusal.
    assert response.status_code == 401
    assert REAUTHENTICATION_REQUIRED_HEADER not in response


@pytest.mark.django_db
def test_ending_another_session_is_an_act(headless, client, signed_in):
    _, (other,) = _sessions_of(client, signed_in, "other")

    refused = headless.call("DELETE", "usersessions:sessions", {"sessions": [other.pk]})
    headless.prove()
    accepted = headless.call("DELETE", "usersessions:sessions", {"sessions": [other.pk]})

    assert _refused(refused)
    assert accepted.status_code == 200
    assert not UserSession.objects.filter(pk=other.pk).exists()


def _redirect_to_provider(client, process):
    callback_url = f"http://{settings.PARENT_HOST}/profile/connections"
    client.get(Headless.url("account:current_session"), HTTP_HOST=f"auth.{settings.PARENT_HOST}")
    return client.post(
        Headless.url("socialaccount:redirect_to_provider"),
        {
            "provider": OIDC_PROVIDER_ID,
            "callback_url": callback_url,
            "process": process,
            "csrfmiddlewaretoken": client.cookies["csrftoken"].value,
        },
        HTTP_HOST=f"auth.{settings.PARENT_HOST}",
    )


@pytest.mark.django_db
def test_connecting_a_provider_unproven_goes_back_to_the_page_with_allauths_own_error(client, signed_in, providers):
    response = _redirect_to_provider(client, "connect")

    assert response.status_code == 302
    location = urlsplit(response["Location"])
    assert f"{location.netloc}{location.path}" == f"{settings.PARENT_HOST}/profile/connections"
    assert parse_qs(location.query) == {"error": ["reauthentication_required"], "error_process": ["connect"]}


@pytest.mark.django_db
def test_connecting_a_provider_once_proven_goes_to_the_provider_and_spends_the_proof(
    headless, client, signed_in, providers
):
    headless.prove()

    response = _redirect_to_provider(client, "connect")

    assert response["Location"].startswith(AUTHORIZATION_ENDPOINT)
    assert _refused(_add_email(headless))


@pytest.mark.django_db
def test_signing_in_through_a_provider_is_not_an_act(client, db, providers):
    response = _redirect_to_provider(client, "login")

    assert response["Location"].startswith(AUTHORIZATION_ENDPOINT)


@pytest.mark.django_db
def test_an_invalid_redirect_is_left_for_allauth_to_refuse(client, signed_in, providers):
    client.get(Headless.url("account:current_session"), HTTP_HOST=f"auth.{settings.PARENT_HOST}")
    response = client.post(
        Headless.url("socialaccount:redirect_to_provider"),
        {"provider": OIDC_PROVIDER_ID, "process": "connect", "csrfmiddlewaretoken": client.cookies["csrftoken"].value},
        HTTP_HOST=f"auth.{settings.PARENT_HOST}",
    )

    assert "reauthentication_required" not in response.get("Location", "")


@pytest.mark.parametrize(("process", "is_an_act"), [("connect", True), ("login", False)])
def test_a_token_is_an_act_only_when_it_connects(process, is_an_act):
    view = ProviderTokenView()
    view.request = RequestFactory().post("/")
    view.input = SimpleNamespace(cleaned_data={"process": process})

    assert view.is_an_act() is is_an_act


@pytest.mark.django_db
def test_the_app_client_is_gated_and_spends_its_proof_on_its_own_session(client, alice):
    host = {"HTTP_HOST": f"auth.{settings.PARENT_HOST}"}

    def url(name):
        return reverse(f"headless:app:{name}", urlconf=AUTH_URLCONF)

    login = client.post(
        url("account:login"),
        json.dumps({"username": "alice", "password": PASSWORD}),
        content_type="application/json",
        **host,
    )
    token = {"HTTP_X_SESSION_TOKEN": login.json()["meta"]["session_token"], **host}

    def add(email):
        body = json.dumps({"email": email})
        return client.post(url("account:manage_email"), body, content_type="application/json", **token)

    first = add("second@example.test")
    second = add("third@example.test")
    proof = client.post(
        url("account:reauthenticate"), json.dumps({"password": PASSWORD}), content_type="application/json", **token
    )
    third = add("third@example.test")

    assert first.status_code == 200
    assert _refused(second)
    assert proof.status_code == 200
    assert third.status_code == 200
    assert User.objects.get(pk=alice.pk).emailaddress_set.count() == 3


@pytest.mark.django_db
def test_reading_in_between_does_not_spend_the_proof(headless, signed_in):
    headless.prove()

    listing = headless.call("GET", "account:manage_email")

    assert listing.status_code == 200
    assert _add_email(headless).status_code == 200


class _Answers:
    def dispatch(self, request):
        return HttpResponse(status=self.status)


class _Gated(ProvesWhoTheyAre, _Answers):
    pass


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("spends_a_proof", "status", "spent"), [(True, 399, True), (True, 400, False), (False, 200, False)]
)
def test_only_an_act_that_succeeded_spends_the_proof(spends_a_proof, status, spent):
    view = _Gated()
    view.spends_a_proof, view.status = spends_a_proof, status
    request = RequestFactory().post("/")
    request.session = SessionStore()
    request.user = User(username="alice")

    view.dispatch(request)

    assert (SPENT_AT_SESSION_KEY in request.session) is spent


class _Records:
    def dispatch(self, request, *args, **kwargs):
        self.handed = (request, args, kwargs)
        return HttpResponse(status=200)


class _GatedRecording(ProvesWhoTheyAre, _Records):
    pass


def test_the_gate_hands_allauth_the_whole_request_it_was_given():
    """allauth's headless views read their URL arguments off dispatch(), so none may go missing."""
    view = _GatedRecording()
    request = RequestFactory().get("/")

    view.dispatch(request, "positional", key="keyword")

    assert view.handed == (request, ("positional",), {"key": "keyword"})


def test_the_redirect_gate_hands_allauth_the_whole_request_it_was_given(monkeypatch):
    seen = []
    monkeypatch.setattr(
        _RedirectToProviderView, "handle", lambda self, *args, **kwargs: seen.append((args, kwargs)) or "answered"
    )
    view = RedirectToProviderView()
    monkeypatch.setattr(view, "refuse_unproven", lambda: None)
    request = RequestFactory().post("/", {})

    assert view.handle(request, "positional", key="keyword") == "answered"
    assert seen == [((request, "positional"), {"key": "keyword"})]
