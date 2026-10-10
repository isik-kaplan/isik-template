from datetime import timedelta

import pytest
from allauth.usersessions.models import UserSession
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st

from apps.users import login_policy
from apps.users.backends import AuthenticationBackend
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.tests.conftest import PASSWORD


LoginPolicy = SiteSettings.LoginPolicy


@pytest.mark.parametrize(
    ("policy", "is_staff", "is_superuser", "admitted"),
    [
        (LoginPolicy.EVERYONE, False, False, True),
        (LoginPolicy.STAFF, False, False, False),
        (LoginPolicy.STAFF, True, False, True),
        (LoginPolicy.STAFF, False, True, True),
        (LoginPolicy.SUPERUSERS, True, False, False),
        (LoginPolicy.SUPERUSERS, False, True, True),
    ],
)
def test_each_rung_admits_whoever_holds_it_and_everybody_above(policy, is_staff, is_superuser, admitted):
    assert LoginPolicy.admits(policy, is_staff=is_staff, is_superuser=is_superuser) is admitted


@given(lower=st.sampled_from(LoginPolicy), higher=st.sampled_from(LoginPolicy), is_staff=st.booleans())
def test_raising_the_ladder_never_lets_anybody_new_in(lower, higher, is_staff):
    ladder = list(LoginPolicy)
    if ladder.index(lower) > ladder.index(higher):
        lower, higher = higher, lower

    if LoginPolicy.admits(higher, is_staff=is_staff, is_superuser=False):
        assert LoginPolicy.admits(lower, is_staff=is_staff, is_superuser=False)
    # Whoever can set the top rung is never shut out by any rung.
    assert LoginPolicy.admits(higher, is_staff=is_staff, is_superuser=True)


@pytest.mark.parametrize(
    ("user", "policy", "admitted"),
    [
        (User(is_superuser=True), LoginPolicy.SUPERUSERS, True),
        (User(is_staff=True), LoginPolicy.STAFF, True),
        (User(is_staff=True), LoginPolicy.SUPERUSERS, False),
        (User(), LoginPolicy.STAFF, False),
    ],
)
def test_a_person_is_read_off_their_own_flags(user, policy, admitted):
    assert login_policy.admits(user, policy) is admitted


@pytest.mark.django_db
def test_with_no_row_the_settings_are_the_defaults():
    current = SiteSettings.current()

    assert current.pk is not None
    assert current._state.adding
    assert current.login_policy == LoginPolicy.EVERYONE
    assert str(current) == "site settings"


@pytest.mark.django_db
def test_the_settings_are_the_one_row_there_is():
    row = SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)

    assert SiteSettings.current() == row
    with pytest.raises(ValidationError):
        SiteSettings.objects.create()


@pytest.mark.django_db
def test_a_refused_sign_in_leaves_a_record(alice, logged):
    SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)

    admitted = login_policy.admits_signing_in(alice)

    assert not admitted
    assert [(line["event"], line["user"], line["policy"]) for line in logged] == [
        ("login.refused_by_policy", str(alice.pk), LoginPolicy.STAFF)
    ]


@pytest.mark.django_db
def test_an_admitted_sign_in_leaves_none(alice, logged):
    assert login_policy.admits_signing_in(alice)

    assert logged == []


def _session_of(user, expires_in=timedelta(days=1)):
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store.create()
    Session.objects.filter(session_key=store.session_key).update(expire_date=timezone.now() + expires_in)
    UserSession.objects.create(user=user, session_key=store.session_key, ip="127.0.0.1")
    return store.session_key


@pytest.mark.django_db
def test_the_sweep_signs_out_everybody_the_rung_excludes_and_nobody_else(alice, audited):
    staff = User.objects.create_user(username="staff", email="staff@example.test", is_staff=True)
    excluded = _session_of(alice)
    kept = _session_of(staff)
    _session_of(alice, expires_in=timedelta(days=-1))

    swept = login_policy.sweep(LoginPolicy.STAFF)

    assert swept == 1
    assert not Session.objects.filter(session_key=excluded).exists()
    assert not UserSession.objects.filter(session_key=excluded).exists()
    assert Session.objects.filter(session_key=kept).exists()
    assert UserSession.objects.filter(session_key=kept).exists()
    assert [(line["event"], line["policy"], line["sessions"]) for line in audited] == [
        ("login_policy.swept", LoginPolicy.STAFF, 1)
    ]


def _queries_of_a_sweep_over(people):
    for n in range(people):
        _session_of(User.objects.create_user(username=f"member-{people}-{n}", email=f"m{people}-{n}@example.test"))
    with CaptureQueriesContext(connection) as captured:
        assert login_policy.sweep(LoginPolicy.STAFF) == people
    return len(captured)


@pytest.mark.django_db
def test_the_sweep_costs_the_same_queries_however_many_it_signs_out():
    """One admin request and one transaction: a sweep that grew with the users would hold both for as
    long as the user table is long."""
    assert _queries_of_a_sweep_over(1) == _queries_of_a_sweep_over(5)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("policy", "shut_out"),
    [
        (LoginPolicy.EVERYONE, set()),
        (LoginPolicy.STAFF, {"member"}),
        (LoginPolicy.SUPERUSERS, {"member", "staff"}),
    ],
)
def test_who_is_shut_out_is_asked_of_the_database_as_the_ladder_says(policy, shut_out):
    User.objects.create_user(username="member", email="member@example.test")
    User.objects.create_user(username="staff", email="staff@example.test", is_staff=True)
    User.objects.create_user(username="root", email="root@example.test", is_superuser=True)
    User.objects.create_user(username="both", email="both@example.test", is_staff=True, is_superuser=True)

    assert set(login_policy.shut_out(policy).values_list("username", flat=True)) == shut_out


@pytest.mark.django_db
def test_the_password_backend_refuses_whoever_the_ladder_shuts_out(alice):
    staff = User.objects.create_user(username="staff", email="staff@example.test", password=PASSWORD, is_staff=True)
    SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)

    assert AuthenticationBackend().authenticate(None, username="alice", password=PASSWORD) is None
    assert AuthenticationBackend().authenticate(None, username="staff", password=PASSWORD) == staff


@pytest.mark.django_db
def test_signing_in_is_refused_through_every_configured_backend(alice):
    assert authenticate(None, username="alice", password=PASSWORD) == alice

    SiteSettings.objects.create(login_policy=LoginPolicy.SUPERUSERS)

    assert authenticate(None, username="alice", password=PASSWORD) is None


@pytest.mark.django_db
def test_a_session_the_sweep_missed_stops_working_on_its_next_request(client, signed_in):
    assert client.get("/v0/users/me/").status_code == 200

    SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)

    assert client.get("/v0/users/me/").status_code == 403


def test_the_backend_is_listed_under_the_path_a_login_records():
    """allauth stores a social login's backend as module + class name; listed any other way, the
    session it opens is anonymous on the very next request."""
    backend = AuthenticationBackend
    assert f"{backend.__module__}.{backend.__name__}" in settings.AUTHENTICATION_BACKENDS


@pytest.mark.django_db
def test_a_password_sign_in_through_allauth_is_refused_rather_than_let_into_a_dead_session(headless, alice):
    SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)

    response = headless.call("POST", "account:login", {"username": "alice", "password": PASSWORD})

    assert response.status_code == 400
    assert headless.call("GET", "account:current_session").status_code == 401


@pytest.mark.django_db
def test_a_password_sign_in_the_ladder_admits_goes_through(headless, alice):
    assert headless.call("POST", "account:login", {"username": "alice", "password": PASSWORD}).status_code == 200


@pytest.mark.django_db
def test_an_inactive_account_is_refused_whatever_the_ladder_says(alice):
    alice.is_active = False
    alice.save()

    assert AuthenticationBackend().user_can_authenticate(alice) is False
