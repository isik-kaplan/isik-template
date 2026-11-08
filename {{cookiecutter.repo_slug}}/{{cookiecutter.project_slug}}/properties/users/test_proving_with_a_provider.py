from urllib.parse import parse_qs, urlsplit

import pytest
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.models import SocialAccount, SocialLogin
from allauth.socialaccount.providers import registry
from allauth.socialaccount.providers.base.constants import AuthProcess
from allauth.socialaccount.providers.github.provider import GitHubProvider
from allauth.socialaccount.providers.openid_connect.provider import OpenIDConnectProvider
from allauth.socialaccount.providers.openid_connect.views import OpenIDConnectOAuth2Adapter
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.backends.db import SessionStore
from django.db import transaction
from django.test import RequestFactory
from hypothesis import given
from hypothesis import strategies as st

from apps.common.links import auth_path
from apps.users.adapters.social_account import LOGINS_CLOSED_ERROR, SocialAccountAdapter
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.reauthentication import proof


OIDC = "test-idp"
AUTHORIZATION_ENDPOINT = "https://idp.example.test/authorize"
AUTH_HOST = f"auth.{settings.PARENT_HOST}"
PROVE_PAGE = f"http://{settings.PARENT_HOST}/auth/prove"


@pytest.fixture
def providers(settings, monkeypatch):
    """An OIDC and a plain OAuth2 provider, registered by hand since allauth only registers installed ones."""
    registry.load()
    for provider_class in (OpenIDConnectProvider, GitHubProvider):
        monkeypatch.setitem(registry.provider_map, provider_class.id, provider_class)
    app = {"client_id": "client", "secret": "secret", "key": ""}
    settings.SOCIALACCOUNT_PROVIDERS = {
        "openid_connect": {
            "APPS": [{**app, "provider_id": OIDC, "name": "Test IdP", "settings": {"server_url": "https://idp.test"}}]
        },
        "github": {"APPS": [app]},
    }
    config = {"authorization_endpoint": AUTHORIZATION_ENDPOINT, "token_endpoint": "https://idp.example.test/token"}
    monkeypatch.setattr(OpenIDConnectOAuth2Adapter, "openid_config", property(lambda self: config))
    monkeypatch.setattr(OpenIDConnectOAuth2Adapter, "get_callback_url", lambda self, request, app: "https://cb.test/")


CLAIM = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=0, max_value=2**40),
    st.floats(min_value=0, max_value=2**40),
    st.text(max_size=3),
)
CLAIMS = st.one_of(st.none(), st.text(max_size=3), st.fixed_dictionaries({}, optional={"auth_time": CLAIM}))
EXTRA_DATA = st.one_of(st.none(), st.fixed_dictionaries({}, optional={"id_token": CLAIMS, "userinfo": CLAIMS}))


def _numeric(value):
    return type(value) in (int, float)


@given(extra_data=EXTRA_DATA)
def test_the_provider_time_is_the_first_numeric_auth_time_id_token_first(extra_data):
    sociallogin = SocialLogin(account=SocialAccount(extra_data=extra_data))
    claimed = [
        claims["auth_time"]
        for claims in ((extra_data or {}).get("id_token"), (extra_data or {}).get("userinfo"))
        if isinstance(claims, dict) and _numeric(claims.get("auth_time"))
    ]

    assert proof.authenticated_at_provider(sociallogin) == (claimed[0] if claimed else None)


@given(
    state=st.one_of(
        st.none(),
        st.fixed_dictionaries(
            {},
            optional={
                "data": st.one_of(
                    st.none(), st.dictionaries(st.sampled_from([proof.PROVING_KEY, proof.ASKED_AT_KEY]), st.booleans())
                )
            },
        ),
    )
)
def test_a_login_is_a_proof_exactly_when_its_state_says_so(state):
    sociallogin = SocialLogin()
    sociallogin.state = state

    assert proof.is_proving(sociallogin) == bool(((state or {}).get("data") or {}).get(proof.PROVING_KEY))


@given(now=st.floats(min_value=0, max_value=2**33))
def test_asking_for_a_proof_stamps_the_whole_second(monkeypatch, now):
    monkeypatch.setattr(proof.time, "time", lambda: now)

    assert proof.proving_state() == {proof.PROVING_KEY: True, proof.ASKED_AT_KEY: int(now)}


def _request(user):
    request = RequestFactory().get("/")
    request.user = user
    request.session = SessionStore()
    return request


def _sociallogin(user, *, process=AuthProcess.LOGIN, data=None, auth_time=None):
    account = SocialAccount(provider=OIDC, uid="sub-1", extra_data={"id_token": {"auth_time": auth_time}})
    sociallogin = SocialLogin(user=user, account=account)
    sociallogin.state = {"process": process, "data": data, "next": PROVE_PAGE}
    return sociallogin


def _landing(request, sociallogin):
    with pytest.raises(ImmediateHttpResponse) as raised:
        SocialAccountAdapter().pre_social_login(request, sociallogin)
    location = urlsplit(raised.value.response["Location"])
    return f"{location.scheme}://{location.netloc}{location.path}", parse_qs(location.query)


@pytest.mark.django_db
@pytest.mark.parametrize("who", ["themselves", "somebody else", "nobody signed in", "an unsaved account"])
@given(offset=st.integers(min_value=-120, max_value=120), missing_time=st.booleans())
def test_a_proof_holds_only_for_the_signed_in_person_challenged_after_we_asked(who, offset, missing_time):
    with transaction.atomic():
        alice = User.objects.create_user(email="alice@example.test")
        mallory = User.objects.create_user(email="mallory@example.test")
        signed_in = {"themselves": alice, "somebody else": mallory, "an unsaved account": alice}
        request = _request(signed_in.get(who, AnonymousUser()))
        asked = proof.proving_state()
        claimed = None if missing_time else asked[proof.ASKED_AT_KEY] + offset
        returning = User(email="new@example.test") if who == "an unsaved account" else alice

        page, query = _landing(request, _sociallogin(returning, data=asked, auth_time=claimed))

        proved = who == "themselves" and claimed is not None and offset >= 0
        assert page == PROVE_PAGE
        assert query == ({"proved": ["1"]} if proved else {"error": [proof.NOT_PROVED_ERROR]})
        assert proof.has_proven_who_they_are(request) == proved
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("policy", SiteSettings.LoginPolicy)
@pytest.mark.parametrize("process", [AuthProcess.LOGIN, AuthProcess.CONNECT])
@given(is_staff=st.booleans(), is_superuser=st.booleans())
def test_a_social_login_goes_on_exactly_when_the_ladder_admits_it_or_it_connects(
    logged, policy, process, is_staff, is_superuser
):
    with transaction.atomic():
        logged.clear()
        SiteSettings.objects.create(login_policy=policy)
        user = User.objects.create_user(email="alice@example.test", is_staff=is_staff, is_superuser=is_superuser)
        sociallogin = _sociallogin(user, process=process)
        admitted = SiteSettings.LoginPolicy.admits(policy, is_staff=is_staff, is_superuser=is_superuser)

        if admitted or process == AuthProcess.CONNECT:
            assert SocialAccountAdapter().pre_social_login(_request(AnonymousUser()), sociallogin) is None
        else:
            page, query = _landing(_request(AnonymousUser()), sociallogin)
            error_page = urlsplit(settings.HEADLESS_FRONTEND_URLS["socialaccount_login_error"])
            assert page == f"{error_page.scheme}://{error_page.netloc}{error_page.path}"
            assert query == {"error": [LOGINS_CLOSED_ERROR]}
        refusals = [line for line in logged if line["event"] == "login.refused_by_policy"]
        assert len(refusals) == (not admitted and process == AuthProcess.LOGIN)
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.usefixtures("providers")
@given(
    has_password=st.booleans(),
    connected=st.sets(st.sampled_from([OIDC, GitHubProvider.id])),
)
def test_the_ways_to_prove_are_a_password_an_oidc_provider_or_setting_a_password(has_password, connected):
    with transaction.atomic():
        user = User.objects.create_user(
            email="alice@example.test", password="pw-correct-horse" if has_password else None
        )
        for index, provider in enumerate(sorted(connected)):
            SocialAccount.objects.create(user=user, provider=provider, uid=str(index))

        flows = {flow["id"]: flow for flow in proof.ways_to_prove(_request(user))}

        assert ("reauthenticate" in flows) == has_password
        if OIDC in connected:
            assert [each["id"] for each in flows[proof.PROVIDER_FLOW]["providers"]] == [OIDC]
        else:
            assert proof.PROVIDER_FLOW not in flows
        if has_password:
            assert proof.SET_PASSWORD_BY_EMAIL_FLOW not in flows
        else:
            assert flows[proof.SET_PASSWORD_BY_EMAIL_FLOW]["email"] == user.email
        transaction.set_rollback(True)


@given(user=st.sampled_from([None, AnonymousUser()]))
def test_nobody_signed_in_has_proven_anything(user):
    request = RequestFactory().get("/")
    if user is not None:
        request.user = user

    assert proof.has_proven_who_they_are(request) is False


@pytest.mark.django_db
@pytest.mark.usefixtures("providers")
@pytest.mark.parametrize(
    ("provider", "safe", "sent"),
    [(OIDC, True, True), (OIDC, False, False), (GitHubProvider.id, True, False), ("nobody-has-it", True, False)],
)
@given(path=st.text(alphabet="abcdefghij/", max_size=12))
def test_proving_goes_to_the_provider_only_for_a_connected_oidc_one_and_a_safe_return(
    client, provider, safe, sent, path
):
    with transaction.atomic():
        alice = User.objects.create_user(email="alice@example.test")
        SocialAccount.objects.create(user=alice, provider=OIDC, uid="sub-1")
        SocialAccount.objects.create(user=alice, provider=GitHubProvider.id, uid="2")
        client.force_login(alice)
        callback = f"{PROVE_PAGE if safe else 'https://elsewhere.example/'}{path}"

        response = client.post(
            auth_path("prove_with_provider"), {"provider": provider, "callback_url": callback}, HTTP_HOST=AUTH_HOST
        )

        if sent:
            assert response.status_code == 302
            assert response["Location"].startswith(AUTHORIZATION_ENDPOINT)
        else:
            assert response.status_code == 400
        transaction.set_rollback(True)
