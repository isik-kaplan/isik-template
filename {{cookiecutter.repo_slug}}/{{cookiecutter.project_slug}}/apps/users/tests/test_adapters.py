from datetime import datetime
from datetime import timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from allauth.core.context import request_context
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import RequestFactory
from django.utils import translation

from apps.users.adapters.account import AccountAdapter
from apps.users.adapters.social_account import SocialAccountAdapter


@pytest.mark.django_db
def test_send_mail_renders_with_the_request_bound_by_allauth_and_leaves_the_sending_to_a_task():
    request = RequestFactory().get("/", HTTP_HOST="auth.example.test")

    with (
        request_context(request),
        patch("apps.users.adapters.account.mjml_template", return_value="<html>body</html>") as mjml,
        patch("apps.users.adapters.account.text_template", side_effect=["text body", "  Subject line  \n"]) as text,
        patch("apps.users.adapters.account.send_account_mail") as task,
        patch("apps.users.tasks.account_mail.send_mail") as smtp,
    ):
        AccountAdapter().send_mail("account/email/email_confirmation", "jane@example.test", {"key": "abc"})

    smtp.assert_not_called()
    mjml.assert_called_once_with(
        "account/email/email_confirmation/message.html", {"key": "abc", "email": "jane@example.test"}, request
    )
    assert text.call_args_list == [
        (("account/email/email_confirmation/message.txt", {"key": "abc", "email": "jane@example.test"}, request),),
        (("account/email/email_confirmation/subject.txt", {"key": "abc", "email": "jane@example.test"}, request),),
    ]
    task.delay.assert_called_once_with("Subject line", "text body", "<html>body</html>", "jane@example.test")


def _languages_a_mail_renders_in(user):
    """Sends a mail to `user` and reports the language active while each of its parts rendered."""
    seen = []

    def render(*args):
        seen.append(translation.get_language())
        return "rendered"

    with (
        request_context(RequestFactory().get("/")),
        patch("apps.users.adapters.account.mjml_template", side_effect=render),
        patch("apps.users.adapters.account.text_template", side_effect=render),
        patch("apps.users.adapters.account.send_account_mail"),
    ):
        AccountAdapter().send_mail("account/email/email_confirmation", "jane@example.test", {"user": user})
    return set(seen)


@pytest.mark.django_db
def test_send_mail_renders_in_the_recipients_own_language(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]

    with translation.override("en"):
        assert _languages_a_mail_renders_in(SimpleNamespace(language="tr")) == {"tr"}
        assert translation.get_language() == "en", "the sender's language has to come back afterwards"


@pytest.mark.django_db
def test_send_mail_to_someone_with_no_choice_keeps_the_active_language(settings):
    """Somebody signing up chose nothing yet, and the request they are making is in their browser's."""
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]

    with translation.override("tr"):
        assert _languages_a_mail_renders_in(SimpleNamespace(language="")) == {"tr"}


@pytest.mark.django_db
def test_mail_waits_for_the_transaction_that_asked_for_it(django_capture_on_commit_callbacks):
    """Mail cannot be rolled back, so a request that fails after asking for one must send nothing."""
    request = RequestFactory().get("/", HTTP_HOST="auth.example.test")

    with (
        request_context(request),
        patch("apps.users.adapters.account.mjml_template", return_value="<html>body</html>"),
        patch("apps.users.adapters.account.text_template", side_effect=["text body", "Subject line"]),
    ):
        with django_capture_on_commit_callbacks(execute=True):
            AccountAdapter().send_mail("account/email/email_confirmation", "jane@example.test", {"key": "abc"})
            assert mail.outbox == []

    (sent,) = mail.outbox
    assert sent.to == ["jane@example.test"]


def test_populate_user_gives_the_unsaved_user_a_real_timestamp_not_the_db_default_sentinel():
    """Without this, the pending-signup path 500s trying to JSON-serialize the suggested user's
    created_at (BaseModel's db_default Now() expression, not a real datetime, since the user is
    never saved before allauth stashes it in the session) - see the adapter's own comment."""
    user = get_user_model()()
    sociallogin = SimpleNamespace(user=user)
    fixed_now = datetime(2024, 1, 1, tzinfo=dt_timezone.utc)

    with patch("apps.users.adapters.social_account.timezone.now", return_value=fixed_now):
        result = SocialAccountAdapter().populate_user(None, sociallogin, {})

    assert result is user
    assert user.created_at == fixed_now
    assert user.updated_at == fixed_now
