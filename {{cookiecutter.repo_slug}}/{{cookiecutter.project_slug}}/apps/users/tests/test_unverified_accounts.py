"""Signups that never proved their address are removed once its link has expired, and nobody else is."""

from datetime import timedelta

import pytest
from allauth.account import app_settings
from allauth.account.models import EmailAddress
{%- if cookiecutter.background_jobs != "celery-with-beat" %}
from django.conf import settings
{%- endif %}
from django.core.management import call_command
from django.utils import timezone
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
from isik.django.scheduling import beat_schedule
{%- endif %}

from apps.users.models.user import User
from apps.users.tasks import unverified
from apps.users.tasks.unverified import remove_unverified_accounts, unverified_accounts


WINDOW = timedelta(days=app_settings.EMAIL_CONFIRMATION_EXPIRE_DAYS)


def _signup(email, *, verified=False, **fields):
    user = User.objects.create_user(email=email, **fields)
    EmailAddress.objects.create(user=user, email=email, verified=verified, primary=True)
    return user


def _later(monkeypatch, by):
    """created_at is the database's, so time moves forward instead of the row going back."""
    monkeypatch.setattr(unverified, "now", lambda: timezone.now() + by)


@pytest.mark.django_db
def test_a_signup_that_never_proved_its_address_goes_once_its_link_has_expired(monkeypatch, audited):
    abandoned = _signup("abandoned@example.test")
    proven = _signup("proven@example.test", verified=True)
    _later(monkeypatch, WINDOW + timedelta(minutes=1))

    remove_unverified_accounts()

    assert list(User.objects.values_list("pk", flat=True)) == [proven.pk]
    assert not EmailAddress.objects.filter(email="abandoned@example.test").exists()
    assert [(line["event"], line["removed"]) for line in audited] == [("accounts.unverified_removed", 1)]
    assert abandoned.pk not in set(User.objects.values_list("pk", flat=True))


@pytest.mark.django_db
def test_one_whose_link_still_works_stays():
    user = _signup("waiting@example.test")

    assert list(unverified_accounts(timezone.now() + WINDOW - timedelta(minutes=1))) == []
    assert list(unverified_accounts(timezone.now() + WINDOW + timedelta(minutes=1))) == [user]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "fields",
    [{"is_staff": True}, {"is_superuser": True}, {"last_login": timezone.now()}],
    ids=["staff", "superuser", "signed-in"],
)
def test_staff_superusers_and_anybody_who_ever_signed_in_are_kept(fields):
    _signup("kept@example.test", **fields)

    assert list(unverified_accounts(timezone.now() + WINDOW * 2)) == []


@pytest.mark.django_db
def test_an_account_with_no_address_record_at_all_is_unverified_too():
    user = User.objects.create_user(email="bare@example.test")

    assert list(unverified_accounts(timezone.now() + WINDOW * 2)) == [user]


@pytest.mark.django_db
def test_a_second_unverified_address_doesnt_undo_a_proven_one():
    user = _signup("main@example.test", verified=True)
    EmailAddress.objects.create(user=user, email="other@example.test", verified=False)

    assert list(unverified_accounts(timezone.now() + WINDOW * 2)) == []


@pytest.mark.django_db
def test_a_run_with_nothing_to_remove_still_says_it_ran(audited):
    remove_unverified_accounts()

    assert [(line["event"], line["removed"]) for line in audited] == [("accounts.unverified_removed", 0)]


@pytest.mark.django_db
def test_the_command_runs_the_same_removal(monkeypatch):
    _signup("abandoned@example.test")
    _later(monkeypatch, WINDOW * 2)

    call_command("remove_unverified_accounts")

    assert not User.objects.exists()
{%- if cookiecutter.background_jobs == "celery-with-beat" %}


def test_the_beat_runs_it_daily():
    entry = beat_schedule()["remove_unverified_accounts"]

    assert entry["task"] == remove_unverified_accounts.name
    assert (entry["schedule"].hour, entry["schedule"].minute) == ({4}, {45})
{%- else %}


def test_the_cron_runs_it_daily():
    uwsgi = (settings.BASE_DIR / "uwsgi.ini").read_text()

    assert "cron2 = hour=4,minute=45,unique=1 python manage.py remove_unverified_accounts" in uwsgi
{%- endif %}
