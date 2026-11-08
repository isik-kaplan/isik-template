from datetime import timedelta
from io import StringIO

import pgtrigger
import pytest
from allauth.account import app_settings
from allauth.account.models import EmailAddress
from allauth.account.signals import (
    email_changed,
    email_confirmed,
    password_changed,
    password_reset,
    password_set,
    user_signed_up,
)
from allauth.mfa.models import Authenticator
from allauth.mfa.signals import authenticator_added, authenticator_removed, authenticator_reset
from allauth.usersessions.models import UserSession
from django.contrib.auth import models as auth_models
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.contrib.contenttypes.models import ContentType
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.management import call_command
from django.db import transaction
from django.test import RequestFactory
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st

from apps.notifications.kinds import RECORDED_MAIL
from apps.notifications.models import Notice
from apps.users import login_policy
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.permissions import VOCABULARY
from apps.users.sync import sync_permissions
from apps.users.tasks.account_mail import send_account_mail
from apps.users.tasks.health_check import ping
from apps.users.tasks.logins_closed import tell_the_people_a_rung_signed_out

from {{ cookiecutter.project_slug }}.config import CONFIG as config


EMAILS = st.text(alphabet="abcdefghij", min_size=1, max_size=10).map(lambda local: f"{local}@example.test")
RANKS = st.sampled_from([(False, False), (True, False), (False, True), (True, True)])
Policy = SiteSettings.LoginPolicy


def _user(email="alice@example.test", **fields):
    return User.objects.create_user(email=email, **fields)


# (signal, extra arguments, event, logger)
SIGNALS = [
    (user_logged_in, {"request": None}, "login.succeeded", "logged"),
    (user_logged_out, {"request": None}, "logout.succeeded", "logged"),
    (user_signed_up, {"request": None}, "signup.completed", "logged"),
    (password_changed, {"request": None}, "password.changed", "audited"),
    (password_set, {"request": None}, "password.changed", "audited"),
    (password_reset, {"request": None}, "password.reset", "audited"),
    (
        email_changed,
        {"request": None, "from_email_address": None, "to_email_address": None},
        "email.changed",
        "audited",
    ),
    (authenticator_reset, {"request": None, "authenticator": None}, "recovery_codes.regenerated", "audited"),
]


@pytest.mark.django_db
@pytest.mark.parametrize(("signal", "extra", "event", "where"), SIGNALS, ids=[each[2] for each in SIGNALS])
@given(email=EMAILS)
def test_every_account_event_is_written_down_against_its_account(logged, audited, signal, extra, event, where, email):
    lines = {"logged": logged, "audited": audited}[where]
    with transaction.atomic():
        lines.clear()
        user = _user(email)

        # allauth's own receivers read the request a real signal carries.
        request = RequestFactory().post("/")
        request.user, request.session = user, SessionStore()
        signal.send(sender=User, user=user, **{**extra, "request": request})

        assert [line["user"] for line in lines if line["event"] == event] == [str(user.pk)]
        assert email not in str(lines)
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(email=EMAILS)
def test_a_confirmed_address_and_a_failed_login_name_the_account_or_nobody(logged, email):
    with transaction.atomic():
        logged.clear()
        user = _user(email)
        address = EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)

        email_confirmed.send(sender=EmailAddress, request=None, email_address=address)
        user_login_failed.send(sender=User, credentials={"email": email, "password": "*"})

        events = [(line["event"], line.get("user")) for line in logged]
        assert events == [("email.confirmed", str(user.pk)), ("login.failed", None)]
        assert email not in str(logged)
        transaction.set_rollback(True)


@pytest.mark.parametrize(
    ("kind", "added", "removed"),
    [
        (Authenticator.Type.TOTP, "mfa.enabled", "mfa.disabled"),
        (Authenticator.Type.WEBAUTHN, "passkey.added", "passkey.removed"),
        (Authenticator.Type.RECOVERY_CODES, None, None),
    ],
)
@pytest.mark.django_db
@given(email=EMAILS)
def test_a_factor_added_or_removed_is_audited_and_recovery_codes_arrive_silently(audited, kind, added, removed, email):
    with transaction.atomic():
        audited.clear()
        user = _user(email)
        authenticator = Authenticator(user=user, type=kind, data={})

        authenticator_added.send(sender=Authenticator, request=None, user=user, authenticator=authenticator)
        authenticator_removed.send(sender=Authenticator, request=None, user=user, authenticator=authenticator)

        assert [line["event"] for line in audited] == [event for event in (added, removed) if event]
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("policy", Policy)
@given(ranks=st.lists(RANKS, min_size=1, max_size=5), expired=st.booleans())
def test_a_sweep_ends_every_live_session_the_policy_refuses_and_no_other(audited, policy, ranks, expired):
    with transaction.atomic():
        audited.clear()
        refused = []
        for index, (is_staff, is_superuser) in enumerate(ranks):
            user = _user(f"user{index}@example.test", is_staff=is_staff, is_superuser=is_superuser)
            store = SessionStore()
            store.create()
            if expired:
                Session.objects.filter(session_key=store.session_key).update(expire_date=timezone.now())
            UserSession.objects.create(user=user, session_key=store.session_key, ip="127.0.0.1")
            if not Policy.admits(policy, is_staff=is_staff, is_superuser=is_superuser):
                refused.append(store.session_key)

        ended = login_policy.sweep(policy)

        assert ended == (0 if expired else len(refused))
        assert not UserSession.objects.filter(session_key__in=refused).exists()
        kept = UserSession.objects.values_list("session_key", flat=True)
        assert len(kept) == len(ranks) - len(refused)
        assert Session.objects.filter(session_key__in=kept).count() == len(kept)
        assert [(line["policy"], line["sessions"]) for line in audited if line["event"] == "login_policy.swept"] == [
            (policy, ended)
        ]
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("cached", Policy)
@pytest.mark.parametrize("stored", Policy)
@given(rank=RANKS)
def test_a_session_is_admitted_by_the_cache_or_else_by_the_stored_policy(cached, stored, rank):
    is_staff, is_superuser = rank
    with transaction.atomic():
        SiteSettings.objects.create(login_policy=stored)
        user = _user(is_staff=is_staff, is_superuser=is_superuser)
        stale = SiteSettings(login_policy=cached)

        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(SiteSettings, "cached", classmethod(lambda cls: stale))
            admitted = login_policy.admits_session(user)

        assert admitted == any(
            Policy.admits(policy, is_staff=is_staff, is_superuser=is_superuser) for policy in (cached, stored)
        )
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("policy", Policy)
@given(people=st.lists(st.tuples(RANKS, st.booleans()), min_size=1, max_size=5))
def test_everybody_active_a_rung_shuts_out_is_told_once(policy, people):
    with transaction.atomic():
        SiteSettings.objects.create(login_policy=policy)
        told = set()
        for index, ((is_staff, is_superuser), active) in enumerate(people):
            user = _user(f"user{index}@example.test", is_staff=is_staff, is_superuser=is_superuser, is_active=active)
            if active and not Policy.admits(policy, is_staff=is_staff, is_superuser=is_superuser):
                told.add(str(user.pk))
        Notice.objects.all().delete()

        tell_the_people_a_rung_signed_out()

        notices = [
            notice.snapshot["user"] for notice in Notice.objects.all() if notice.kind.name == "signed_out_by_policy"
        ]
        assert sorted(notices) == sorted(told)
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("prefix", [None, "account/email/not-a-kind", *sorted(RECORDED_MAIL)[:2]])
@given(subject=st.text(alphabet="abc ", min_size=1, max_size=20), recipient=EMAILS, with_user=st.booleans())
def test_an_account_mail_is_sent_as_handed_whether_or_not_it_is_recorded(logged, prefix, subject, recipient, with_user):
    with transaction.atomic():
        mail.outbox.clear()
        logged.clear()
        user_id = str(_user(recipient).pk) if with_user else None

        send_account_mail.apply((subject, "text", "<p>html</p>", recipient, prefix, user_id))

        (sent,) = mail.outbox
        assert (sent.subject, sent.body, sent.to) == (subject, "text", [recipient])
        unrecorded = [line for line in logged if line["event"] == "account_mail.unrecorded"]
        assert len(unrecorded) == (prefix not in RECORDED_MAIL)
        transaction.set_rollback(True)


@given(times=st.integers(min_value=1, max_value=3))
def test_the_health_check_always_answers_pong(times):
    assert [ping() for _ in range(times)] == ["pong"] * times


@pytest.mark.django_db
@given(
    age_days=st.integers(min_value=0, max_value=30),
    verified=st.booleans(),
    signed_in=st.booleans(),
    rank=RANKS,
)
def test_only_old_never_verified_never_used_plain_signups_are_removed(audited, age_days, verified, signed_in, rank):
    is_staff, is_superuser = rank
    with transaction.atomic():
        audited.clear()
        user = _user(is_staff=is_staff, is_superuser=is_superuser, last_login=timezone.now() if signed_in else None)
        EmailAddress.objects.create(user=user, email=user.email, verified=verified, primary=True)
        # created_at is the database's to set, so the clock moves instead.
        later = timezone.now() + timedelta(days=age_days, minutes=1)

        with pytest.MonkeyPatch.context() as patch:
            patch.setattr("apps.users.tasks.unverified.now", lambda: later)
            call_command("remove_unverified_accounts")

        removed = (
            age_days >= app_settings.EMAIL_CONFIRMATION_EXPIRE_DAYS
            and not verified
            and not signed_in
            and rank == (False, False)
        )
        assert User.objects.filter(pk=user.pk).exists() != removed
        lines = [line["removed"] for line in audited if line["event"] == "accounts.unverified_removed"]
        assert lines == [int(removed)]
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(existing=st.booleans(), runs=st.integers(min_value=1, max_value=2))
def test_setup_makes_one_verified_superuser_and_only_when_there_is_none(existing, runs):
    with transaction.atomic():
        User.objects.filter(is_superuser=True).delete()
        if existing:
            User.objects.create_superuser(email="root@example.test")
        out = StringIO()

        for _ in range(runs):
            call_command("setup", stdout=out)

        (superuser,) = User.objects.filter(is_superuser=True)
        if existing:
            assert superuser.email == "root@example.test"
            assert "skipping" in out.getvalue()
        else:
            assert superuser.email == config.SETUP.SUPERUSER.EMAIL
{%- if cookiecutter.phone == "required" %}
            assert superuser.phone_verified
{%- endif %}
            assert EmailAddress.objects.filter(user=superuser, verified=True, primary=True).exists()
            assert ("skipping" in out.getvalue()) == (runs > 1)
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(
    relabelled=st.sets(st.sampled_from(sorted(VOCABULARY.by_name))),
    removed=st.sets(st.sampled_from(sorted(VOCABULARY.by_name))),
    stale=st.sets(st.sampled_from(["old:act:one", "old:act:two"])),
)
def test_syncing_leaves_exactly_the_vocabulary_under_its_labels(relabelled, removed, stale):
    sentinel = ContentType.objects.get_for_model(auth_models.Permission)
    rows = auth_models.Permission.objects.filter(content_type=sentinel)
    with transaction.atomic():
        rows.filter(codename__in=relabelled).update(name="an old label")
        with pgtrigger.ignore("users.ProtectedPermission:protect_permission_delete"):
            rows.filter(codename__in=removed - relabelled).delete()
        for name in stale:
            auth_models.Permission.objects.create(content_type=sentinel, codename=name, name=name)

        sync_permissions()

        assert dict(rows.values_list("codename", "name")) == {
            name: declaration.label for name, declaration in VOCABULARY.by_name.items()
        }
        transaction.set_rollback(True)
