from types import SimpleNamespace

import pytest
from django.conf import settings
from django.core import mail

from apps.common.email import mjml_template, text_template
from apps.users.models.user import User


# Every account/email/<flow> directory this adapter knows how to render, regardless of whether
# the current settings actually reach it (login_code/password_reset_code need
# ACCOUNT_LOGIN_BY_CODE_ENABLED/ACCOUNT_PASSWORD_RESET_BY_CODE_ENABLED, both off by default) - a
# template that only compiles when a flag happens to be on isn't really ported.
FLOWS = [
    "account_already_exists",
    "email_changed",
    "email_confirm",
    "email_confirmation_signup",
    "email_confirmation",
    "email_deleted",
    "login_code",
    "password_changed",
    "password_reset_key",
    "password_reset_code",
    "password_reset",
    "password_set",
    "unknown_account",
]

# SocialLogin.connect()/disconnect() send these unconditionally whenever ACCOUNT_EMAIL_NOTIFICATIONS
# is on - unlike FLOWS above, allauth calls send_notification_mail with this prefix itself, so a
# missing template here doesn't fail at render time in this test, it fails mid-request in production.
SOCIAL_FLOWS = [
    "account_connected",
    "account_disconnected",
]

# One dummy per placeholder any flow's message/subject templates reference - a superset, not
# tailored per flow, since irrelevant keys in the context are harmless.
DUMMY_CONTEXT = {
    "email": "someone@example.test",
    "password_reset_url": "https://example.test/reset",
    "username": "alice",
    "code": "123456",
    "activate_url": "https://example.test/activate",
    "from_email": "old@example.test",
    "to_email": "new@example.test",
    "deleted_email": "gone@example.test",
    "signup_url": "https://example.test/signup",
    "ip": "127.0.0.1",
    "user_agent": "pytest",
    "timestamp": "2026-01-01T00:00:00Z",
}


@pytest.mark.django_db
@pytest.mark.parametrize("flow", FLOWS)
def test_every_ported_flow_renders(flow):
    """Guards against a template syntax error in any flow, including the ones current settings
    never actually trigger - a broken extends/block chain here would otherwise only surface the
    day someone flips the setting that reaches it."""
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    context = {**DUMMY_CONTEXT, "user": user}

    html = mjml_template(f"account/email/{flow}/message.html", context, None)
    text = text_template(f"account/email/{flow}/message.txt", context, None)
    subject = text_template(f"account/email/{flow}/subject.txt", context, None).strip()

    assert "<html" in html.lower() or "!doctype" in html.lower()
    assert text.strip()
    assert subject


@pytest.mark.django_db
@pytest.mark.parametrize("flow", SOCIAL_FLOWS)
def test_every_ported_social_flow_renders(flow):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    context = {**DUMMY_CONTEXT, "user": user, "provider": SimpleNamespace(name="Google")}

    html = mjml_template(f"socialaccount/email/{flow}/message.html", context, None)
    text = text_template(f"socialaccount/email/{flow}/message.txt", context, None)
    subject = text_template(f"socialaccount/email/{flow}/subject.txt", context, None).strip()

    assert "<html" in html.lower() or "!doctype" in html.lower()
    assert text.strip()
    assert subject


@pytest.mark.django_db
def test_signup_sends_a_real_confirmation_email(client):
    """End-to-end through the real adapter, not a direct template call - this is what actually
    proves send_mail's email_folder path-building matches allauth's own template_prefix shape."""
    host = f"auth.{settings.PARENT_HOST}"
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)
    client.post(
        "/v0/browser/v1/auth/signup",
        data={"username": "newuser", "email": "newuser@example.test", "password": "correct-horse-battery-staple"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )

    assert len(mail.outbox) == 1
    sent = mail.outbox[0]
    assert sent.to == ["newuser@example.test"]
    assert sent.subject
    # html_message is set via send_mail(..., html_message=...), surfaced as the second alternative.
    assert sent.alternatives
    html_body = sent.alternatives[0][0]
    assert "<html" in html_body.lower() or "!doctype" in html_body.lower()


@pytest.mark.django_db
def test_password_reset_request_sends_the_reset_key_email(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    host = f"auth.{settings.PARENT_HOST}"

    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)
    client.post(
        "/v0/browser/v1/auth/password/request",
        data={"email": user.email},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )

    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [user.email]
