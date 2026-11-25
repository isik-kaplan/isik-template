"""Groups grant what they give, and the settings ladder signs out exactly whom it shuts out."""

import time
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from allauth.usersessions.models import UserSession
from django.contrib.sessions.backends.db import SessionStore
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st
from rest_framework.exceptions import PermissionDenied

from apps.common.links import api_path
from apps.users.api.serializers.group import GroupSerializer
from apps.users.login_policy import admits
from apps.users.models.group import Group
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.permissions import VOCABULARY
from conftest import give_authentication_records, versioned


NAMES = sorted(VOCABULARY.by_name)
GIVEN = st.sets(st.sampled_from(NAMES), max_size=len(NAMES))
POLICIES = st.sampled_from(list(SiteSettings.LoginPolicy))
RANKS = st.sampled_from([(False, False), (True, False), (False, True), (True, True)])
URL = api_path("users:site-settings-current")
MAIL = "apps.users.api.serializers.site_settings.tell_the_people_a_rung_signed_out.delay"


def _request(**rank):
    return SimpleNamespace(user=User.objects.create_user(email="actor@example.test", **rank))


@pytest.mark.django_db
@given(made=GIVEN, changed=st.none() | GIVEN, name=st.from_regex(r"[a-z]{1,12}", fullmatch=True))
def test_a_superuser_stores_exactly_the_permissions_a_group_is_given(made, changed, name):
    with transaction.atomic():
        context = {"request": _request(is_superuser=True)}
        created = GroupSerializer(data={"name": name, "permissions": sorted(made)}, context=context)
        assert created.is_valid(), created.errors
        group = created.save()
        data = {} if changed is None else {"permissions": sorted(changed)}
        updated = GroupSerializer(group, data=data, partial=True, context=context)
        assert updated.is_valid(), updated.errors
        updated.save()

        group = Group.objects.get(pk=group.pk)
        assert (str(group), group.permission_names) == (name, sorted(made if changed is None else changed))
        assert GroupSerializer(group).data["permissions"] == group.permission_names
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(names=st.sets(st.sampled_from(NAMES), min_size=1))
def test_somebody_who_may_not_grant_gives_a_group_nothing(names):
    with transaction.atomic():
        context = {"request": _request(is_staff=True)}
        serializer = GroupSerializer(data={"name": "ops", "permissions": sorted(names)}, context=context)

        with pytest.raises(PermissionDenied):
            serializer.is_valid()
        transaction.set_rollback(True)


def _a_session_of(user):
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store.create()
    UserSession.objects.create(user=user, session_key=store.session_key, ip="127.0.0.1")


@pytest.fixture
def proved(client, db):
    """A signed-in staff member who proved it just now; each example sets whether they are a superuser."""
    person = User.objects.create_user(email="actor@example.test", is_staff=True)
    client.force_login(person)
    session = client.session
    give_authentication_records(session, person, [{"method": "password", "at": time.time(), "reauthenticated": True}])
    session.save()
    return person


@given(
    was=POLICIES,
    asked=POLICIES,
    people=st.lists(RANKS, max_size=4),
    mail=st.none() | st.booleans(),
    actor_is_superuser=st.booleans(),
)
def test_moving_the_ladder_signs_out_exactly_whom_it_newly_shuts_out(
    client, proved, was, asked, people, mail, actor_is_superuser
):
    with transaction.atomic():
        User.objects.filter(pk=proved.pk).update(is_superuser=actor_is_superuser)
        settings = SiteSettings.objects.create(login_policy=was)
        accounts = [
            User.objects.create_user(email=f"p{index}@example.test", is_staff=staff, is_superuser=superuser)
            for index, (staff, superuser) in enumerate(people)
        ]
        for account in accounts:
            _a_session_of(account)
        data = {"login_policy": asked, **({} if mail is None else {"mail_the_people_signed_out": mail})}

        with patch(MAIL) as delay:
            response = client.patch(URL, data, content_type="application/json", headers=versioned(settings))

        # Staff under the top rung are signed out themselves before they can lower it.
        admitted = actor_is_superuser or was != SiteSettings.LoginPolicy.SUPERUSERS
        allowed = actor_is_superuser or asked != SiteSettings.LoginPolicy.SUPERUSERS
        assert response.status_code == (403 if not admitted else 200 if allowed else 400)
        if admitted and allowed:
            # Sessions were made in a known state, so a move signs out everybody the new rung refuses.
            expected = 0 if asked == was else sum(not admits(account, asked) for account in accounts)
            assert response.json()["signed_out"] == expected
            assert delay.called is bool(expected and mail)
        transaction.set_rollback(True)


# Its own property, so every run reaches the mail: the one above draws it only now and then.
@given(asked=st.sampled_from([SiteSettings.LoginPolicy.STAFF, SiteSettings.LoginPolicy.SUPERUSERS]))
def test_raising_the_ladder_mails_whoever_it_signed_out_when_asked(client, proved, asked):
    with transaction.atomic():
        User.objects.filter(pk=proved.pk).update(is_superuser=True)
        settings = SiteSettings.objects.create()
        _a_session_of(User.objects.create_user(email="member@example.test"))

        with patch(MAIL) as delay:
            body = {"login_policy": asked, "mail_the_people_signed_out": True}
            response = client.patch(URL, body, content_type="application/json", headers=versioned(settings))

        assert (response.json()["signed_out"], delay.call_count) == (1, 1)
        transaction.set_rollback(True)


# Its own property, so every run reaches the refusal: the one above draws it only now and then.
@given(was=st.sampled_from([SiteSettings.LoginPolicy.EVERYONE, SiteSettings.LoginPolicy.STAFF]))
def test_staff_below_superuser_may_not_shut_out_everybody_but_superusers(client, proved, was):
    with transaction.atomic():
        settings = SiteSettings.objects.create(login_policy=was)
        body = {"login_policy": SiteSettings.LoginPolicy.SUPERUSERS}

        response = client.patch(URL, body, content_type="application/json", headers=versioned(settings))

        assert response.status_code == 400
        assert SiteSettings.current().login_policy == was
        transaction.set_rollback(True)
