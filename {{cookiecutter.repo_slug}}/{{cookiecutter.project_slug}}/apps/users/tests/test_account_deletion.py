"""A person deleting their own account: asked behind a fresh proof, signed out at once, deleted when the time
comes unless they sign in first - erased or anonymized, as ACCOUNTS__DELETION says."""

import json
from datetime import timedelta

import pytest
from allauth.account.models import EmailAddress
from django.conf import settings
from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.utils import timezone
from isik.django.apps.accounts.deletion import request_deletion

from apps.common.links import api_path, auth_path
from apps.notifications.models import Notice
from apps.users.deletion import DELETION_BACKENDS, deletion_backend
from apps.users.models import PersonalAccessToken
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token
from apps.users.tests.conftest import PASSWORD
from conftest import deliver_waiting_notices


DELETION = api_path("users:account-deletion")
ACCOUNTS = settings.ISIK["DJANGO"]["ACCOUNTS"]


@pytest.fixture
def proven(signed_in, headless):
    headless.prove()
    return signed_in


@pytest.fixture
def anonymizing(settings):
    settings.ISIK = {
        **settings.ISIK,
        "DJANGO": {
            **settings.ISIK["DJANGO"],
            "ACCOUNTS": {**ACCOUNTS, "DELETION_BACKEND": DELETION_BACKENDS["anonymize"]},
        },
    }


@pytest.fixture
def erasing(settings):
    settings.ISIK = {
        **settings.ISIK,
        "DJANGO": {**settings.ISIK["DJANGO"], "ACCOUNTS": {**ACCOUNTS, "DELETION_BACKEND": DELETION_BACKENDS["erase"]}},
    }


def _due(user):
    """Asked for, and its time come."""
    request_deletion(user)
    User.objects.filter(pk=user.pk).update(deletes_at=timezone.now() - timedelta(seconds=1))


@pytest.mark.django_db
def test_the_page_is_told_what_deleting_does_and_how_long_there_is_to_change_their_mind(client, signed_in):
    body = client.get(DELETION).json()

    assert body == {"deletion_mode": settings.ACCOUNT_DELETION, "after_days": ACCOUNTS["DELETION_AFTER"].days}


@pytest.mark.django_db
def test_asking_needs_a_fresh_proof(client, signed_in):
    response = client.post(DELETION)

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"
    signed_in.refresh_from_db()
    assert signed_in.deletes_at is None


@pytest.mark.django_db
def test_asking_schedules_it_and_signs_them_out_everywhere(client, proven, audited):
    before = timezone.now()

    response = client.post(DELETION)

    assert response.status_code == 202
    proven.refresh_from_db()
    assert proven.deletes_at - before >= ACCOUNTS["DELETION_AFTER"]
    assert response.json()["deletes_at"] == proven.deletes_at.isoformat().replace("+00:00", "Z")
    # The very session that asked is over too.
    assert client.get(DELETION).status_code in (401, 403)
    requested = ("accounts.deletion_requested", str(proven.pk), proven.deletes_at.isoformat())
    assert requested in [(line["event"], line.get("user"), line.get("deletes_at")) for line in audited]


@pytest.mark.django_db
def test_a_superuser_may_delete_theirs_too(client, proven):
    User.objects.filter(pk=proven.pk).update(is_superuser=True, is_staff=True)

    assert client.post(DELETION).status_code == 202


@pytest.mark.django_db
def test_asking_takes_every_personal_access_token_for_good(proven):
    make_token(user=proven, scopes=[], name="laptop")

    request_deletion(proven)

    assert not PersonalAccessToken.objects.filter(user=proven).exists()


@pytest.mark.django_db
def test_an_app_session_ends_with_the_rest(client, alice):
    host = {"HTTP_HOST": f"auth.{settings.PARENT_HOST}"}
    login = client.post(
        auth_path("headless:app:account:login"),
        json.dumps({"email": alice.email, "password": PASSWORD}),
        content_type="application/json",
        **host,
    )
    token = {"HTTP_X_SESSION_TOKEN": login.json()["meta"]["session_token"], **host}
    assert client.get(auth_path("headless:app:account:current_session"), **token).status_code == 200

    request_deletion(alice)

    assert client.get(auth_path("headless:app:account:current_session"), **token).status_code == 401


@pytest.mark.django_db
def test_the_mail_says_when_and_how_to_keep_it(alice):
    deletes_at = request_deletion(alice)
    deliver_waiting_notices()

    (sent,) = mail.outbox
    assert sent.to == [alice.email]
    assert sent.subject == "Your account will be deleted"
    assert deletes_at.date().isoformat() in sent.body
    assert "Sign in before then" in sent.body
    assert f"Thank you for using {settings.PROJECT_NAME}." in sent.body


@pytest.mark.django_db
def test_signing_back_in_keeps_the_account_and_says_so(headless, alice, audited):
    request_deletion(alice)

    response = headless.call("POST", "account:login", {"email": alice.email, "password": PASSWORD})

    assert response.status_code == 200
    alice.refresh_from_db()
    assert alice.deletes_at is None
    assert Notice.objects.filter(kind__name="deletion_cancelled", snapshot__user=str(alice.pk)).exists()
    assert ("accounts.deletion_cancelled", str(alice.pk)) in [(line["event"], line.get("user")) for line in audited]


@pytest.mark.django_db
def test_signing_in_with_nothing_pending_cancels_nothing(headless, alice):
    headless.call("POST", "account:login", {"email": alice.email, "password": PASSWORD})

    assert not Notice.objects.filter(kind__name="deletion_cancelled").exists()


@pytest.mark.django_db
def test_erasing_leaves_nothing_of_theirs(erasing, alice, audited):
    _due(alice)

    call_command("delete_due_accounts")

    assert not User.objects.filter(pk=alice.pk).exists()
    assert not EmailAddress.objects.filter(email=alice.email).exists()
    assert not User.pgh_event_model.objects.filter(pgh_obj_id=alice.pk).exists()
    assert ("accounts.deleted", str(alice.pk)) in [(line["event"], line.get("user")) for line in audited]


@pytest.mark.django_db
def test_anonymizing_keeps_a_nameless_tombstone_that_cannot_sign_in(anonymizing, alice):
    make_token(user=alice, scopes=[], name="laptop")
    _due(alice)

    call_command("delete_due_accounts")

    tombstone = User.objects.get(pk=alice.pk)
    assert tombstone.email == f"deleted-{alice.pk}@example.invalid"
    assert (tombstone.username, tombstone.first_name, tombstone.last_name, tombstone.language) == (None, "", "", "")
    assert not tombstone.is_active
    assert not tombstone.has_usable_password()
    assert tombstone.deletes_at is None
    assert not EmailAddress.objects.filter(user=tombstone).exists()
    # Its history no longer holds the address either.
    emails = set(User.pgh_event_model.objects.filter(pgh_obj_id=alice.pk).values_list("email", flat=True))
    assert emails == {tombstone.email}


@pytest.mark.django_db
def test_only_an_account_whose_time_has_come_is_deleted(erasing, alice):
    request_deletion(alice)

    call_command("delete_due_accounts")

    assert User.objects.filter(pk=alice.pk).exists()


def test_a_deletion_backend_is_named_or_startup_fails():
    assert deletion_backend("erase") == "isik.django.apps.accounts.backends.Erase"
    assert deletion_backend("anonymize") == "isik.django.apps.accounts.backends.Anonymize"
    with pytest.raises(ImproperlyConfigured, match="^ACCOUNTS__DELETION is 'shred'; it is one of erase, anonymize$"):
        deletion_backend("shred")
