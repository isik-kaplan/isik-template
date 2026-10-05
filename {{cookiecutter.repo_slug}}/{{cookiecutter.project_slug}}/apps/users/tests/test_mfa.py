import pytest
from allauth.core import context as allauth_context
from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import (
    TOTP,
    format_hotp_value,
    generate_totp_secret,
    hotp_value,
    yield_hotp_counters_from_time,
)
from django.conf import settings
from django.core import mail
from django.test import RequestFactory

from apps.users.adapters.mfa import MFAAdapter
from apps.users.models.user import User


AUTH_HOST = f"auth.{settings.PARENT_HOST}"
PASSWORD = "correct-horse-battery-staple"


def _current_code(secret):
    return format_hotp_value(hotp_value(secret, next(yield_hotp_counters_from_time())))


def _primed(client):
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=AUTH_HOST)
    return client.cookies["csrftoken"].value


def _post(client, path, data):
    return client.post(
        path, data=data, content_type="application/json", HTTP_HOST=AUTH_HOST, HTTP_X_CSRFTOKEN=_primed(client)
    )


def _user_with_totp():
    user = User.objects.create_user(username="alice", email="alice@example.test", password=PASSWORD)
    user.emailaddress_set.create(email=user.email, primary=True, verified=True)
    secret = generate_totp_secret()
    TOTP.activate(user, secret)
    RecoveryCodes.activate(user)
    return user, secret


def test_allauth_resolves_this_projects_adapter():
    assert isinstance(get_adapter(), MFAAdapter)


def test_the_passkey_relying_party_is_the_bare_domain_the_frontend_runs_on():
    request = RequestFactory().get("/", HTTP_HOST=AUTH_HOST)

    with allauth_context.request_context(request):
        entity = get_adapter().get_public_key_credential_rp_entity()

    assert entity == {"id": settings.PARENT_HOST, "name": settings.MFA_TOTP_ISSUER}


def test_the_authenticator_app_shows_the_project_not_the_site_placeholder():
    request = RequestFactory().get("/", HTTP_HOST=AUTH_HOST)
    user = User(username="alice", email="alice@example.test")

    with allauth_context.request_context(request):
        url = get_adapter().build_totp_url(user, "A" * 32)

    assert url.startswith("otpauth://totp/alice%40example.test?")
    assert "example.com" not in url


@pytest.mark.django_db
def test_the_headless_config_advertises_every_factor_but_no_passkey_login(client):
    response = client.get("/v0/browser/v1/config", HTTP_HOST=AUTH_HOST)

    assert response.json()["data"]["mfa"] == {
        "supported_types": ["totp", "recovery_codes", "webauthn"],
        "passkey_login_enabled": False,
    }


@pytest.mark.django_db
def test_no_passwordless_passkey_login_route_is_mounted(client):
    response = client.get("/v0/browser/v1/auth/webauthn/login", HTTP_HOST=AUTH_HOST)

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_password_alone_is_not_enough_once_a_factor_exists(client):
    _user_with_totp()

    response = _post(client, "/v0/browser/v1/auth/login", {"email": "alice@example.test", "password": PASSWORD})

    assert response.status_code == 401
    flows = {flow["id"]: flow for flow in response.json()["data"]["flows"]}
    assert flows["mfa_authenticate"]["is_pending"] is True
    assert set(flows["mfa_authenticate"]["types"]) == {"totp", "recovery_codes"}


@pytest.mark.django_db
def test_the_authenticator_code_completes_the_login(client):
    _, secret = _user_with_totp()
    _post(client, "/v0/browser/v1/auth/login", {"email": "alice@example.test", "password": PASSWORD})

    response = _post(client, "/v0/browser/v1/auth/2fa/authenticate", {"code": _current_code(secret)})

    assert response.status_code == 200
    assert response.json()["meta"]["is_authenticated"] is True


def _unused_recovery_codes(user):
    return Authenticator.objects.get(user=user, type=Authenticator.Type.RECOVERY_CODES).wrap().get_unused_codes()


@pytest.mark.django_db
def test_a_recovery_code_completes_the_login_once(client):
    user, _ = _user_with_totp()
    code = _unused_recovery_codes(user)[0]
    _post(client, "/v0/browser/v1/auth/login", {"email": "alice@example.test", "password": PASSWORD})

    response = _post(client, "/v0/browser/v1/auth/2fa/authenticate", {"code": code})

    assert response.status_code == 200
    assert code not in _unused_recovery_codes(user)


@pytest.mark.django_db
def test_enabling_totp_mails_the_owner_through_the_projects_own_template(client, django_capture_on_commit_callbacks):
    user = User.objects.create_user(username="alice", email="alice@example.test", password=PASSWORD)
    user.emailaddress_set.create(email=user.email, primary=True, verified=True)
    _post(client, "/v0/browser/v1/auth/login", {"email": "alice@example.test", "password": PASSWORD})
    secret = client.get("/v0/browser/v1/account/authenticators/totp", HTTP_HOST=AUTH_HOST).json()["meta"]["secret"]

    # allauth mails from transaction.on_commit, which the test transaction never reaches by itself.
    with django_capture_on_commit_callbacks(execute=True):
        response = _post(client, "/v0/browser/v1/account/authenticators/totp", {"code": _current_code(secret)})

    assert response.status_code == 200
    assert [message.subject for message in mail.outbox] == ["Two-factor authentication enabled"]


@pytest.mark.django_db
def test_the_frontend_origin_is_cors_allowed_over_https_too(client):
    """The e2e passkey specs reach this DEBUG backend over https, and passkeys exist only there."""
    origin = f"https://{settings.PARENT_HOST}"

    response = client.get("/v0/browser/v1/auth/session", HTTP_HOST=AUTH_HOST, HTTP_ORIGIN=origin)

    assert response["Access-Control-Allow-Origin"] == origin
    assert f"https://{AUTH_HOST}" in settings.CSRF_TRUSTED_ORIGINS
