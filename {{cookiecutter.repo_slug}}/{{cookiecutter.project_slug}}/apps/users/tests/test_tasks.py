from unittest.mock import patch

import pytest
from django.core import mail
from django.utils import translation

from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.tasks.health_check import ping
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out


def test_ping_task_returns_pong():
    # Calling a Task instance directly runs it synchronously, in-process - no broker needed.
    assert ping() == "pong"


@pytest.mark.django_db
def test_the_people_a_rung_shuts_out_are_mailed_in_their_own_language(settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)
    # The ones it skips first, so skipping one is not taken for being done.
    User.objects.create_user(username="gone", email="gone@example.test", is_active=False)
    User.objects.create_user(username="no-address", email="")
    User.objects.create_user(username="staff", email="staff@example.test", is_staff=True)
    member = User.objects.create_user(username="member", email="member@example.test", language="tr")
    seen = []
    with patch("apps.users.tasks.logins_closed.AccountAdapter.send_mail") as send_mail:
        send_mail.side_effect = lambda *args: seen.append(translation.get_language())
        mailed = tell_the_people_a_rung_signed_out()

    assert mailed == [str(member.pk)]
    send_mail.assert_called_once_with("account/email/logins_closed", "member@example.test", {"user": member})
    assert seen == ["tr"]


@pytest.mark.django_db
def test_the_mail_says_why_they_were_signed_out():
    SiteSettings.objects.create(login_policy=SiteSettings.LoginPolicy.STAFF)
    User.objects.create_user(username="member", email="member@example.test")

    tell_the_people_a_rung_signed_out()

    (sent,) = mail.outbox
    assert sent.to == ["member@example.test"]
    assert sent.subject == "You have been signed out"
    assert "restricted" in sent.body
