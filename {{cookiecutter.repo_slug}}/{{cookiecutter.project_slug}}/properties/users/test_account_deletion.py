from datetime import timedelta

import pytest
from django.conf import settings
from django.contrib.auth.signals import user_logged_in
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.db import transaction
from django.test import Client, override_settings
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.accounts.deletion import request_deletion

from apps.common.links import api_path
from apps.notifications.models import Notice
from apps.oauth_provider.models import Application
from apps.oauth_provider.services import AccessToken, RefreshToken
from apps.users.deletion import DELETION_BACKENDS, deletion_backend
from apps.users.models import PersonalAccessToken
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token
from apps.users.tests.conftest import PASSWORD, Headless


MODES = st.sampled_from(sorted(DELETION_BACKENDS))
DELETION = api_path("users:account-deletion")


def deleting_by(mode):
    """The settings with `mode`'s backend, as ACCOUNTS__DELETION would name it."""
    accounts = {**settings.ISIK["DJANGO"]["ACCOUNTS"], "DELETION_BACKEND": deletion_backend(mode)}
    return override_settings(ISIK={**settings.ISIK, "DJANGO": {**settings.ISIK["DJANGO"], "ACCOUNTS": accounts}})


@given(name=st.one_of(MODES, st.text(max_size=12)))
def test_a_name_is_one_of_isiks_backends_or_startup_fails(name):
    if name in DELETION_BACKENDS:
        assert deletion_backend(name) == DELETION_BACKENDS[name]
    else:
        with pytest.raises(ImproperlyConfigured):
            deletion_backend(name)


# None: never asked. Otherwise minutes from now until it is due, so zero and below are due already.
DUE_IN = st.one_of(st.none(), st.integers(min_value=-3, max_value=3))


@pytest.mark.django_db
@given(mode=MODES, due_in=st.lists(DUE_IN, min_size=1, max_size=3))
def test_the_sweep_takes_exactly_the_accounts_whose_time_has_come_as_the_mode_says(mode, due_in):
    with transaction.atomic():
        now = timezone.now()
        people = [User.objects.create_user(email=f"person-{n}@example.test") for n in range(len(due_in))]
        for person, minutes in zip(people, due_in, strict=True):
            if minutes is not None:
                request_deletion(person)
                User.objects.filter(pk=person.pk).update(deletes_at=now + timedelta(minutes=minutes))

        with deleting_by(mode):
            call_command("delete_due_accounts")

        for person, minutes in zip(people, due_in, strict=True):
            left = User.objects.filter(pk=person.pk).first()
            if minutes is None or minutes > 0:
                assert left.email == person.email
            elif mode == "erase":
                assert left is None
            else:
                assert (left.email, left.is_active) == (f"deleted-{person.pk}@example.invalid", False)
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(
    tokens=st.integers(min_value=0, max_value=2),
    applications=st.integers(min_value=0, max_value=2),
    refreshed=st.booleans(),
)
def test_asking_leaves_no_token_of_theirs_working_and_everybody_elses(tokens, applications, refreshed):
    with transaction.atomic():
        person, other = (User.objects.create_user(email=f"{name}@example.test") for name in ("person", "other"))
        later = timezone.now() + timedelta(hours=1)
        for n in range(tokens):
            make_token(user=person, scopes=[], name=f"token {n}")
        for n in range(applications):
            application = Application.objects.create(
                name=f"app {n}",
                user=other,
                client_type=Application.CLIENT_PUBLIC,
                authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
                redirect_uris="https://app.example.test/callback",
            )
            for holder in (person, other):
                token = f"{n}-{holder.pk}"
                access = AccessToken.objects.create(user=holder, application=application, token=token, expires=later)
                if refreshed:
                    RefreshToken.objects.create(
                        user=holder, application=application, token=f"r-{token}", access_token=access
                    )
        make_token(user=other, scopes=[], name="theirs")

        request_deletion(person)

        assert not PersonalAccessToken.objects.filter(user=person).exists()
        assert not AccessToken.objects.filter(user=person).exists()
        assert not RefreshToken.objects.filter(user=person, revoked__isnull=True).exists()
        assert PersonalAccessToken.objects.filter(user=other).count() == 1
        assert AccessToken.objects.filter(user=other).count() == applications
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(pending=st.booleans())
def test_signing_in_cancels_a_pending_deletion_and_says_so_only_then(pending):
    with transaction.atomic():
        person = User.objects.create_user(email="person@example.test")
        if pending:
            request_deletion(person)

        user_logged_in.send(sender=User, request=None, user=person)

        person.refresh_from_db()
        assert person.deletes_at is None
        cancelled = Notice.objects.filter(kind__name="deletion_cancelled", snapshot__user=str(person.pk))
        assert cancelled.exists() == pending
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(proven=st.booleans(), mode=MODES)
def test_only_a_fresh_proof_schedules_it_and_the_page_is_told_the_mode(proven, mode):
    with transaction.atomic():
        person = User.objects.create_user(email="person@example.test", password=PASSWORD)
        client = Client()
        client.force_login(person)
        if proven:
            Headless(client).prove()

        with override_settings(ACCOUNT_DELETION=mode):
            described = client.get(DELETION).json()
        asked = client.post(DELETION)

        assert described["deletion_mode"] == mode
        assert asked.status_code == (202 if proven else 403)
        person.refresh_from_db()
        assert (person.deletes_at is not None) == proven
        transaction.set_rollback(True)
