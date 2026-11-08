import json
import time
from urllib.parse import parse_qs, urlsplit

import pytest
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from allauth.socialaccount.providers import registry
from allauth.socialaccount.providers.github.provider import GitHubProvider
from allauth.socialaccount.providers.openid_connect.provider import OpenIDConnectProvider
from allauth.socialaccount.providers.openid_connect.views import OpenIDConnectOAuth2Adapter
from allauth.usersessions.models import UserSession
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st

from apps.common.links import auth_path
from apps.users.models.user import User
from apps.users.reauthentication.gate import REAUTHENTICATION_REQUIRED_HEADER
from conftest import give_authentication_records


OIDC = "test-idp"
AUTHORIZATION_ENDPOINT = "https://idp.example.test/authorize"
AUTH_HOST = f"auth.{settings.PARENT_HOST}"
PASSWORD = "correct-horse-battery-staple"
CALLBACK = f"http://{settings.PARENT_HOST}/profile/connections"

# Never the signed-in person's own address or number.
EMAILS = st.text(alphabet="bcdfghjk", min_size=1, max_size=10).map(lambda local: f"{local}@example.test")
PHONES = st.integers(min_value=1000, max_value=9999).map(lambda n: f"+1415555{n}")
# Past every password validator, so the gate is what answers.
PASSWORDS = st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789-", max_size=12).map(lambda s: f"Zq7-{s}-wren")


@pytest.fixture
def providers(settings, monkeypatch):
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


def _csrf(client):
    client.get(auth_path("headless:browser:account:current_session"), HTTP_HOST=AUTH_HOST)
    return client.cookies["csrftoken"].value


def _call(client, method, name, data):
    return client.generic(
        method,
        auth_path(f"headless:browser:{name}"),
        json.dumps(data),
        content_type="application/json",
        HTTP_HOST=AUTH_HOST,
        HTTP_X_CSRFTOKEN=_csrf(client),
    )


def add_email(client, user, drawn):
    return _call(client, "POST", "account:manage_email", {"email": drawn["email"]})


def set_first_password(client, user, drawn):
    return _call(client, "POST", "account:change_password", {"new_password": drawn["password"]})


{% if cookiecutter.phone != "none" -%}
def change_phone(client, user, drawn):
    return _call(client, "POST", "account:manage_phone", {"phone": drawn["phone"]})


{% endif -%}def end_another_session(client, user, drawn):
    _csrf(client)
    UserSession.objects.create(user=user, session_key=client.session.session_key, ip="127.0.0.1")
    other = UserSession.objects.create(user=user, session_key=f"other-{drawn['phone']}", ip="127.0.0.1")
    return _call(client, "DELETE", "usersessions:sessions", {"sessions": [other.pk]})


def disconnect_provider(client, user, drawn):
    SocialAccount.objects.create(user=user, provider=GitHubProvider.id, uid=drawn["phone"])
    return _call(client, "DELETE", "socialaccount:manage_providers", {"provider": "github", "account": drawn["phone"]})


ACTS = [add_email, set_first_password, {% if cookiecutter.phone != "none" %}change_phone, {% endif %}end_another_session, disconnect_provider]


def _sign_in(client, proven, password=PASSWORD):
{%- if cookiecutter.phone != "none" %}
    user = User.objects.create_user(
        email="alice@example.test", password=password, phone="+14155550100", phone_verified=True
    )
{%- else %}
    user = User.objects.create_user(email="alice@example.test", password=password)
{%- endif %}
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
    client.force_login(user)
    if proven:
        session = client.session
        give_authentication_records(
            session, user, [{"method": "socialaccount", "at": time.time(), "reauthenticated": True}]
        )
        session.save()
    return user


def _events(logged, name):
    return [line for line in logged if line["event"] == name]


@pytest.mark.django_db
@pytest.mark.usefixtures("providers")
@pytest.mark.parametrize("act", ACTS, ids=lambda act: act.__name__)
@pytest.mark.parametrize("proven", [False, True], ids=["unproven", "proven"])
@given(email=EMAILS, phone=PHONES, password=PASSWORDS)
def test_an_act_goes_through_only_with_a_proof_and_spends_it(client, logged, act, proven, email, phone, password):
    with transaction.atomic():
        # allauth's rate limits count in the cache, across examples.
        cache.clear()
        # Setting a first password is the act only for somebody without one.
        user = _sign_in(client, proven, None if act is set_first_password else PASSWORD)
        logged.clear()

        response = act(client, user, {"email": email, "phone": phone, "password": password})

        demanded, spent = _events(logged, "reauthentication.demanded"), _events(logged, "reauthentication.spent")
        if proven:
            assert response.status_code < 400, response.content
            assert REAUTHENTICATION_REQUIRED_HEADER not in response
            assert (len(demanded), len(spent)) == (0, 1)
        else:
            assert response.status_code == 401
            assert response[REAUTHENTICATION_REQUIRED_HEADER] == "1"
            assert (len(demanded), len(spent)) == (1, 0)
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.usefixtures("providers")
@pytest.mark.parametrize("proven", [False, True], ids=["unproven", "proven"])
@given(path=st.text(alphabet="abcdefgh", max_size=8))
def test_connecting_a_provider_unproven_goes_back_with_allauths_error(client, logged, proven, path):
    with transaction.atomic():
        _sign_in(client, proven)
        logged.clear()
        data = {
            "provider": OIDC,
            "callback_url": f"{CALLBACK}{path}",
            "process": "connect",
            "csrfmiddlewaretoken": _csrf(client),
        }

        response = client.post(
            auth_path("headless:browser:socialaccount:redirect_to_provider"), data, HTTP_HOST=AUTH_HOST
        )

        location = urlsplit(response["Location"])
        if proven:
            assert response["Location"].startswith(AUTHORIZATION_ENDPOINT)
            assert len(_events(logged, "reauthentication.spent")) == 1
        else:
            assert f"{location.scheme}://{location.netloc}{location.path}" == f"{CALLBACK}{path}"
            assert parse_qs(location.query) == {"error": ["reauthentication_required"], "error_process": ["connect"]}
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("proven", [False, True], ids=["unproven", "proven"])
@given(name=st.sampled_from(["mfa:manage_totp"]))
def test_a_new_totp_secret_is_handed_out_only_to_somebody_who_proved_it_is_them(client, logged, proven, name):
    with transaction.atomic():
        _sign_in(client, proven)
        logged.clear()

        response = client.get(auth_path(f"headless:browser:{name}"), HTTP_HOST=AUTH_HOST)

        if proven:
            assert response.status_code == 404
            assert response.json()["meta"]["secret"]
        else:
            assert response.status_code == 401
            assert response[REAUTHENTICATION_REQUIRED_HEADER] == "1"
        assert len(_events(logged, "reauthentication.demanded")) == (not proven)
        transaction.set_rollback(True)
