"""Raising the login policy tells each person it signed out, in their inbox and by email."""

from unittest.mock import patch

import pytest
from django.core import mail
from django.utils import translation

from apps.notifications.models import Delivery, InboxItem, Notice
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out
from conftest import deliver_waiting_notices


@pytest.fixture
def staff_only(db):
    return SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)


@pytest.mark.django_db
def test_everybody_the_rung_shuts_out_gets_a_notice_and_nobody_else(staff_only):
    # Skipped ones first, so skipping one isn't mistaken for being done.
    User.objects.create_user(username="gone", email="gone@example.test", is_active=False)
    User.objects.create_user(username="no-address", email="")
    User.objects.create_user(username="staff", email="staff@example.test", is_staff=True)
    members = [User.objects.create_user(username=f"member-{n}", email=f"member-{n}@example.test") for n in range(3)]

    tell_the_people_a_rung_signed_out()

    notices = Notice.objects.filter(kind__name="signed_out_by_policy")
    assert sorted(notice.snapshot["user"] for notice in notices) == sorted(str(member.pk) for member in members)


@pytest.mark.django_db
def test_the_mail_says_why_they_were_signed_out_and_the_inbox_keeps_it(staff_only):
    member = User.objects.create_user(username="member", email="member@example.test")

    tell_the_people_a_rung_signed_out()
    deliver_waiting_notices()

    (sent,) = mail.outbox
    assert sent.to == ["member@example.test"]
    assert sent.subject == "You have been signed out"
    assert "restricted" in sent.body
    assert InboxItem.objects.filter(user=member, kind__name="signed_out_by_policy").count() == 1


@pytest.mark.django_db
def test_each_one_is_mailed_in_their_own_language(staff_only, a_second_language):
    """The worker has no request language to fall back on."""
    User.objects.create_user(username="member", email="member@example.test", language="tr")
    seen = []
    send = mail.EmailMultiAlternatives.send

    def recording(message, *args, **kwargs):
        seen.append(translation.get_language())
        return send(message, *args, **kwargs)

    tell_the_people_a_rung_signed_out()
    with translation.override("en"), patch.object(mail.EmailMultiAlternatives, "send", recording):
        deliver_waiting_notices()

    assert seen == ["tr"]


@pytest.mark.django_db
def test_somebody_deleted_before_it_fans_out_is_nobody_to_tell(staff_only):
    member = User.objects.create_user(username="member", email="member@example.test")
    tell_the_people_a_rung_signed_out()
    member.delete()

    deliver_waiting_notices()

    assert mail.outbox == []
    assert not Delivery.objects.exists()


@pytest.mark.django_db
def test_one_persons_failed_mail_waits_for_its_retry_without_holding_up_anybody_else(staff_only):
    for name in ("fine", "flaky"):
        User.objects.create_user(username=name, email=f"{name}@example.test")
    send = mail.EmailMultiAlternatives.send

    def flaky(message, *args, **kwargs):
        if message.to == ["flaky@example.test"]:
            raise ConnectionRefusedError
        return send(message, *args, **kwargs)

    tell_the_people_a_rung_signed_out()
    with patch.object(mail.EmailMultiAlternatives, "send", flaky):
        deliver_waiting_notices()

    assert [sent.to for sent in mail.outbox] == [["fine@example.test"]]
    flaky_one = Delivery.objects.get(channel="email", email__address="flaky@example.test")
    assert (flaky_one.state, flaky_one.attempt_count) == ("pending", 1)
