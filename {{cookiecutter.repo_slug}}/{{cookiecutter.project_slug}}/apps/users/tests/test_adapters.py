from datetime import datetime
from datetime import timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import patch

from allauth.core.context import request_context
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from apps.users.adapters import AccountAdapter, SocialAccountAdapter


def test_send_mail_renders_and_sends_with_the_request_bound_by_allauth():
    request = RequestFactory().get("/", HTTP_HOST="auth.example.test")

    with (
        request_context(request),
        patch("apps.users.adapters.mjml_template", return_value="<html>body</html>") as mjml,
        patch("apps.users.adapters.text_template", side_effect=["text body", "  Subject line  \n"]) as text,
        patch("apps.users.adapters.send_mail") as send,
    ):
        AccountAdapter().send_mail("account/email/email_confirmation", "jane@example.test", {"key": "abc"})

    mjml.assert_called_once_with(
        "account/email/email_confirmation/message.html", {"key": "abc", "email": "jane@example.test"}, request
    )
    assert text.call_args_list == [
        (("account/email/email_confirmation/message.txt", {"key": "abc", "email": "jane@example.test"}, request),),
        (("account/email/email_confirmation/subject.txt", {"key": "abc", "email": "jane@example.test"}, request),),
    ]
    send.assert_called_once_with(
        "Subject line",
        "text body",
        settings.DEFAULT_FROM_EMAIL,
        ["jane@example.test"],
        fail_silently=False,
        html_message="<html>body</html>",
    )


def test_populate_user_gives_the_unsaved_user_a_real_timestamp_not_the_db_default_sentinel():
    """Without this, the pending-signup path 500s trying to JSON-serialize the suggested user's
    created_at (BaseModel's db_default Now() expression, not a real datetime, since the user is
    never saved before allauth stashes it in the session) - see the adapter's own comment."""
    user = get_user_model()()
    sociallogin = SimpleNamespace(user=user)
    fixed_now = datetime(2024, 1, 1, tzinfo=dt_timezone.utc)

    with patch("apps.users.adapters.timezone.now", return_value=fixed_now):
        result = SocialAccountAdapter().populate_user(None, sociallogin, {})

    assert result is user
    assert user.created_at == fixed_now
    assert user.updated_at == fixed_now
