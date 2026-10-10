from smtplib import SMTPServerDisconnected
from unittest.mock import patch

import pytest
from django.conf import settings
from django.core import mail
from django.core.mail import get_connection
from django.utils import translation

from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.tasks.account_mail import send_account_mail
from apps.users.tasks.health_check import ping
from apps.users.tasks.logins_closed import tell_one_person_a_rung_signed_out, tell_the_people_a_rung_signed_out

from {{ cookiecutter.project_slug }}.celery import app as celery_app


def test_ping_task_returns_pong():
    # Calling a Task instance directly runs it synchronously, in-process - no broker needed.
    assert ping() == "pong"


@pytest.mark.django_db
def test_the_people_a_rung_shuts_out_get_one_task_each():
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)
    # The ones it skips first, so skipping one is not taken for being done.
    User.objects.create_user(username="gone", email="gone@example.test", is_active=False)
    User.objects.create_user(username="no-address", email="")
    User.objects.create_user(username="staff", email="staff@example.test", is_staff=True)
    members = [User.objects.create_user(username=f"member-{n}", email=f"member-{n}@example.test") for n in range(3)]

    with patch("apps.users.tasks.logins_closed.tell_one_person_a_rung_signed_out.delay") as delay:
        tell_the_people_a_rung_signed_out()

    assert sorted(call.args for call in delay.call_args_list) == sorted((str(member.pk),) for member in members)


@pytest.mark.django_db
def test_each_one_is_mailed_in_their_own_language(a_second_language):
    """The worker has no request whose language could stand in, so the recipient's own is the only one."""
    member = User.objects.create_user(username="member", email="member@example.test", language="tr")
    seen = []

    def render(*args):
        seen.append(translation.get_language())
        return "rendered"

    with (
        translation.override("en"),
        patch("apps.users.adapters.account.mjml_template", side_effect=render),
        patch("apps.users.adapters.account.text_template", side_effect=render),
    ):
        tell_one_person_a_rung_signed_out(str(member.pk))

    assert set(seen) == {"tr"}
    (sent,) = mail.outbox
    assert sent.to == ["member@example.test"]


@pytest.mark.django_db
def test_somebody_deleted_since_the_fan_out_is_nobody_to_tell():
    member = User.objects.create_user(username="member", email="member@example.test")
    pk = str(member.pk)
    member.delete()

    tell_one_person_a_rung_signed_out(pk)

    assert mail.outbox == []


@pytest.mark.django_db
def test_the_mail_says_why_they_were_signed_out():
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)
    User.objects.create_user(username="member", email="member@example.test")

    tell_the_people_a_rung_signed_out()

    (sent,) = mail.outbox
    assert sent.to == ["member@example.test"]
    assert sent.subject == "You have been signed out"
    assert "restricted" in sent.body


@pytest.fixture
def retries_run_in_process(monkeypatch):
    """An in-process task that propagates its failures raises its own retry rather than running it."""
    monkeypatch.setattr(celery_app.conf, "task_eager_propagates", False)


@pytest.mark.django_db
@pytest.mark.usefixtures("retries_run_in_process")
def test_one_recipients_failure_retries_that_recipient_alone():
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)
    for name in ("fine", "flaky"):
        User.objects.create_user(username=name, email=f"{name}@example.test")
    attempts = []

    def deliver(subject, text, sender, recipients, **kwargs):
        attempts.append(recipients[0])
        if recipients == ["flaky@example.test"] and attempts.count("flaky@example.test") == 1:
            raise SMTPServerDisconnected("gone")

    with patch("apps.users.tasks.account_mail.send_mail", side_effect=deliver):
        tell_the_people_a_rung_signed_out()

    assert sorted(attempts) == ["fine@example.test", "flaky@example.test", "flaky@example.test"]


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
