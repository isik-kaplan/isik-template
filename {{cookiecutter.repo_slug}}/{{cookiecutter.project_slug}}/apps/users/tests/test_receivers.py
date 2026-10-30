import time

import pytest
from allauth.account.models import EmailAddress
from allauth.account.signals import email_changed, email_confirmed, password_reset
from allauth.mfa import app_settings as mfa_settings
from allauth.mfa.models import Authenticator
from allauth.mfa.signals import authenticator_added, authenticator_removed
from allauth.mfa.totp.internal.auth import format_hotp_value, hotp_value, yield_hotp_counters_from_time
from django.conf import settings
from django.contrib.auth.signals import user_logged_out

from apps.users.models.user import User


AUTH_HOST = f"auth.{settings.PARENT_HOST}"


@pytest.fixture
def alice():
    user = User.objects.create_user(username="alice", email="alice@example.test", password="the-password")
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
    return user


def headless(client, method, path, data=""):
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=AUTH_HOST)  # primes the csrftoken cookie
    return getattr(client, method)(
        f"/v0/browser/v1/{path}",
        data=data,
        content_type="application/json",
        HTTP_HOST=AUTH_HOST,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )


def events(lines):
    return [line for line in lines if line["event"] != "request"]


@pytest.mark.django_db
def test_signing_in_names_who_signed_in(client, alice, logged):
    response = headless(client, "post", "auth/login", {"username": "alice", "password": "the-password"})

    assert response.status_code == 200
    (line,) = events(logged)
    assert (line["event"], line["user"], line["code"]) == ("login.succeeded", str(alice.pk), "apps.users.receivers")


@pytest.mark.django_db
def test_a_failed_sign_in_names_nobody(client, alice, logged):
    response = headless(client, "post", "auth/login", {"username": "alice", "password": "wrong"})

    assert response.status_code == 400
    (line,) = events(logged)
    assert line["event"] == "login.failed"
    assert "alice" not in str(line) and "wrong" not in str(line)


@pytest.mark.django_db
def test_signing_out_names_who_signed_out(client, alice, logged):
    client.force_login(alice)
    logged.clear()

    response = headless(client, "delete", "auth/session")

    assert response.status_code == 401
    assert [(line["event"], line["user"]) for line in events(logged)] == [("logout.succeeded", str(alice.pk))]


def test_a_sign_out_of_nobody_writes_nothing(logged):
    user_logged_out.send(sender=User, request=None, user=None)

    assert logged == []


@pytest.mark.django_db
def test_signing_up_names_the_new_account(client, logged):
    headless(
        client,
        "post",
        "auth/signup",
        {"username": "newuser", "email": "newuser@example.test", "password": "correct-horse-battery-staple"},
    )

    user = User.objects.get(username="newuser")
    assert [(line["event"], line["user"]) for line in events(logged)] == [("signup.completed", str(user.pk))]


@pytest.mark.django_db
def test_confirming_an_address_names_its_owner(alice, logged):
    email_confirmed.send(sender=EmailAddress, request=None, email_address=alice.emailaddress_set.get())

    assert [(line["event"], line["user"]) for line in logged] == [("email.confirmed", str(alice.pk))]


@pytest.mark.django_db
def test_changing_a_password_is_audited(client, alice, logged, audited):
    client.force_login(alice)
    logged.clear()

    response = headless(
        client, "post", "account/password/change", {"current_password": "the-password", "new_password": "a-new-one-1"}
    )

    assert response.status_code == 200
    assert [(line["event"], line["user"], line["how"]) for line in audited] == [
        ("password.changed", str(alice.pk), "changed")
    ]
    assert [line["event"] for line in events(logged)] == []


@pytest.mark.django_db
def test_setting_a_first_password_is_the_same_audited_event(client, alice, audited, monkeypatch):
    monkeypatch.setattr("apps.users.reauthentication.gate.has_proven_who_they_are", lambda request: True)
    alice.set_unusable_password()
    alice.save()
    client.force_login(alice)

    response = headless(client, "post", "account/password/change", {"new_password": "a-first-one-1"})

    assert response.status_code == 200
    assert [(line["event"], line["user"], line["how"]) for line in audited] == [
        ("password.changed", str(alice.pk), "set")
    ]


@pytest.mark.django_db
def test_resetting_a_password_is_audited(alice, audited):
    password_reset.send(sender=User, request=None, user=alice)

    assert [(line["event"], line["user"]) for line in audited] == [("password.reset", str(alice.pk))]


@pytest.mark.django_db
def test_changing_the_primary_address_is_audited(alice, audited):
    email_changed.send(sender=User, request=None, user=alice, from_email_address=None, to_email_address=None)

    assert [(line["event"], line["user"]) for line in audited] == [("email.changed", str(alice.pk))]


def _current_code(secret):
    # A code read in its window's last moments can expire before allauth checks it.
    left = mfa_settings.TOTP_PERIOD - time.time() % mfa_settings.TOTP_PERIOD
    time.sleep(left if left < 2 else 0)
    return format_hotp_value(hotp_value(secret, next(yield_hotp_counters_from_time())))


@pytest.fixture
def alice_signed_in(client, alice):
    headless(client, "post", "auth/login", {"username": "alice", "password": "the-password"})
    return alice


def _enable_totp(client):
    _prove(client)
    secret = client.get("/v0/browser/v1/account/authenticators/totp", HTTP_HOST=AUTH_HOST).json()["meta"]["secret"]
    return headless(client, "post", "account/authenticators/totp", {"code": _current_code(secret)})


def _prove(client):
    """Each factor change spends a proof."""
    assert headless(client, "post", "auth/reauthenticate", {"password": "the-password"}).status_code == 200


def _second_factor_events(lines):
    return [(line["event"], line["user"], line.get("method")) for line in lines]


@pytest.mark.django_db
def test_enabling_an_authenticator_app_is_audited_without_its_recovery_codes(client, alice_signed_in, audited):
    response = _enable_totp(client)

    assert response.status_code == 200
    assert _second_factor_events(audited) == [("mfa.enabled", str(alice_signed_in.pk), "totp")]


@pytest.mark.django_db
def test_disabling_the_authenticator_app_is_audited(client, alice_signed_in, audited):
    _enable_totp(client)
    audited.clear()
    _prove(client)

    response = headless(client, "delete", "account/authenticators/totp")

    assert response.status_code == 200
    assert _second_factor_events(audited) == [("mfa.disabled", str(alice_signed_in.pk), "totp")]


@pytest.mark.django_db
def test_regenerating_recovery_codes_is_audited(client, alice_signed_in, audited):
    _enable_totp(client)
    audited.clear()
    _prove(client)

    response = headless(client, "post", "account/authenticators/recovery-codes")

    assert response.status_code == 200
    assert _second_factor_events(audited) == [("recovery_codes.regenerated", str(alice_signed_in.pk), None)]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("signal", "event"), [(authenticator_added, "passkey.added"), (authenticator_removed, "passkey.removed")]
)
def test_a_passkey_coming_or_going_is_audited(alice, audited, signal, event):
    """Through the signal: a real ceremony needs an authenticator device."""
    passkey = Authenticator(user=alice, type=Authenticator.Type.WEBAUTHN, data={})

    signal.send(sender=Authenticator, request=None, user=alice, authenticator=passkey)

    assert _second_factor_events(audited) == [(event, str(alice.pk), None)]
