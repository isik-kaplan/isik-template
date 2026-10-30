"""allauth's mail goes out as allauth sends it, and is recorded beside everything else sent."""

from pathlib import Path
from smtplib import SMTPServerDisconnected
from unittest.mock import patch

import pytest
from django.conf import settings

from apps.notifications.kinds import RECORDED_MAIL
from apps.notifications.models import Delivery, DeliveryAttempt
from apps.users.tasks.account_mail import send_account_mail


TEMPLATES = Path(settings.BASE_DIR) / "templates"


def test_every_mail_the_project_renders_has_a_kind_to_be_recorded_as():
    """A mail allauth adds is sent unrecorded rather than held up, so this is where its absence shows."""
    shipped = {str(subject.parent.relative_to(TEMPLATES)) for subject in TEMPLATES.glob("*/email/*/subject.txt")}

    assert shipped == set(RECORDED_MAIL)


@pytest.mark.django_db
def test_a_sent_mail_is_recorded_as_sent_without_what_it_said(alice):
    send_account_mail.apply(
        (
            "Reset",
            "your link: https://reset.example.test/key",
            "<html>",
            alice.email,
            "account/email/password_reset_key",
            str(alice.pk),
        )
    )

    delivery = Delivery.objects.get()
    assert (delivery.notice.kind.name, delivery.state, delivery.email.address, delivery.email.user_id) == (
        "mail_password_reset_key",
        "sent",
        alice.email,
        str(alice.pk),
    )
    assert not DeliveryAttempt.objects.filter(request__icontains="reset.example.test").exists()


@pytest.mark.django_db
@pytest.mark.usefixtures("retries_run_in_process")
def test_a_mail_that_took_three_tries_is_one_delivery_with_three_attempts(alice):
    outage = SMTPServerDisconnected("gone")
    with patch("apps.users.tasks.account_mail.send_mail", side_effect=[outage, outage, None]):
        result = send_account_mail.apply(
            ("Subject", "text", "<html>", alice.email, "account/email/password_changed", str(alice.pk))
        )

    assert result.state == "SUCCESS"
    delivery = Delivery.objects.get()
    assert (delivery.state, delivery.attempt_count) == ("sent", 3)


@pytest.mark.django_db
def test_a_mail_nobody_declared_a_kind_for_is_still_sent_and_says_so(logged, mailoutbox):
    send_account_mail.apply(("Subject", "text", "<html>", "jane@example.test", "account/email/brand_new", None))

    assert [sent.to for sent in mailoutbox] == [["jane@example.test"]]
    assert not Delivery.objects.exists()
    assert [(line["event"], line["template"]) for line in logged] == [
        ("account_mail.unrecorded", "account/email/brand_new")
    ]
