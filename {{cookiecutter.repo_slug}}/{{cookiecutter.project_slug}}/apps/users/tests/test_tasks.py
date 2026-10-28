from smtplib import SMTPServerDisconnected
from unittest.mock import patch

import pytest
from django.conf import settings
from django.core import mail
from django.core.mail import get_connection

from apps.users.tasks.account_mail import send_account_mail
from apps.users.tasks.health_check import ping


def test_ping_task_returns_pong():
    assert ping() == "pong"


def test_a_mail_host_that_hangs_times_out_rather_than_holding_the_worker():
    assert settings.EMAIL_TIMEOUT == 10
    assert get_connection("django.core.mail.backends.smtp.EmailBackend").timeout == settings.EMAIL_TIMEOUT


@pytest.mark.django_db
@pytest.mark.usefixtures("retries_run_in_process")
class TestSendingAnAccountMail:
    def test_it_sends_what_it_was_handed(self):
        send_account_mail("Subject", "text", "<html>", "jane@example.test")

        (sent,) = mail.outbox
        assert (sent.subject, sent.body, sent.to) == ("Subject", "text", ["jane@example.test"])
        assert sent.from_email == settings.DEFAULT_FROM_EMAIL
        assert sent.alternatives[0][0] == "<html>"

    @pytest.mark.parametrize(
        "outage",
        [SMTPServerDisconnected("gone"), ConnectionRefusedError(), TimeoutError("timed out")],
        ids=["smtp", "refused", "hung past EMAIL_TIMEOUT"],
    )
    def test_an_outage_is_retried_until_it_passes(self, outage):
        with patch("apps.users.tasks.account_mail.send_mail", side_effect=[outage, outage, None]) as send:
            result = send_account_mail.apply(("Subject", "text", "<html>", "jane@example.test"))

        assert result.state == "SUCCESS"
        assert send.call_count == 3

    def test_an_outage_that_outlasts_every_retry_fails_the_task(self):
        with patch("apps.users.tasks.account_mail.send_mail", side_effect=TimeoutError("timed out")) as send:
            result = send_account_mail.apply(("Subject", "text", "<html>", "jane@example.test"))

        assert result.state == "FAILURE"
        assert isinstance(result.result, TimeoutError)
        assert send.call_count == 1 + 5

    def test_it_backs_off_between_attempts(self):
        assert send_account_mail.retry_backoff is True
        assert send_account_mail.max_retries == 5
