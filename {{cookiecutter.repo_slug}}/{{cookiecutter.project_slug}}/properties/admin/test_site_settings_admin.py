"""The one settings row in the admin: there is always exactly one to go to, and moving the ladder signs out
exactly the sessions it now shuts out."""

from unittest.mock import patch

import pytest
from allauth.usersessions.models import UserSession
from django.conf import settings
from django.contrib.admin.sites import site
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.db import transaction
from django.test import RequestFactory
from hypothesis import given
from hypothesis import strategies as st

from apps.common.links import admin_path
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User


pytestmark = pytest.mark.django_db

HOST = {"HTTP_HOST": f"admin.{settings.PARENT_HOST}"}
LoginPolicy = SiteSettings.LoginPolicy
POLICIES = [policy.value for policy in LoginPolicy]
RANKS = st.lists(st.sampled_from(["member", "staff"]), max_size=4)


def _url(name, *args):
    return admin_path(f"admin:users_sitesettings_{name}", *args)


@pytest.fixture
def root(db):
    return User.objects.create_superuser(username="root", email="root@example.test", password="x")


def _a_session_of(user):
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store.create()
    UserSession.objects.create(user=user, session_key=store.session_key, ip="127.0.0.1")
    return store.session_key


@pytest.mark.parametrize("exists", [False, True])
@given(policy=st.sampled_from(POLICIES))
def test_the_list_always_lands_on_the_one_row_or_on_creating_it(client, root, exists, policy):
    with transaction.atomic():
        client.force_login(root)
        row = SiteSettings.objects.create(login_policy=policy) if exists else None

        response = client.get(_url("changelist"), **HOST)

        assert response["Location"] == (_url("change", row.pk) if exists else _url("add"))
        transaction.set_rollback(True)


@pytest.mark.parametrize("before", [None, *POLICIES])
@pytest.mark.parametrize("after", POLICIES)
@given(ranks=RANKS, mail=st.booleans())
def test_saving_signs_out_exactly_whom_a_moved_ladder_shuts_out(client, root, before, after, ranks, mail):
    with transaction.atomic():
        client.force_login(root)
        row = SiteSettings.objects.create(login_policy=before) if before else None
        sessions = {}
        for index, rank in enumerate(ranks):
            person = User.objects.create_user(
                username=f"p{index}", email=f"p{index}@example.test", is_staff=rank == "staff"
            )
            sessions[_a_session_of(person)] = rank
        data = {"login_policy": after, **({"mail_the_people_signed_out": "on"} if mail else {})}

        with patch("apps.admin.admin.site_settings.tell_the_people_a_rung_signed_out.delay") as delay:
            url = _url("change", row.pk) if row else _url("add")
            response = client.post(url, data, follow=True, **HOST)

        moved = (before or LoginPolicy.EVERYONE.value) != after if row else after != LoginPolicy.EVERYONE.value
        shut_out = {
            key
            for key, rank in sessions.items()
            if moved and not LoginPolicy.admits(after, is_staff=rank == "staff", is_superuser=False)
        }
        assert set(Session.objects.filter(session_key__in=sessions).values_list("session_key", flat=True)) == (
            set(sessions) - shut_out
        )
        assert delay.called is bool(mail and shut_out)
        notes = [str(message) for message in response.context["messages"]]
        assert any("signed out" in note for note in notes) is moved
        transaction.set_rollback(True)


@pytest.mark.parametrize("is_superuser", [False, True])
@given(exists=st.booleans())
def test_nobody_deletes_the_row_and_only_a_superuser_is_offered_the_top_rung(root, is_superuser, exists):
    with transaction.atomic():
        model_admin = site._registry[SiteSettings]
        root.is_superuser = is_superuser
        request = RequestFactory().get("/")
        request.user = root
        if exists:
            SiteSettings.objects.create()

        field = model_admin.formfield_for_choice_field(SiteSettings._meta.get_field("login_policy"), request)

        assert not model_admin.has_delete_permission(request)
        assert (LoginPolicy.SUPERUSERS.value in [value for value, _ in field.choices]) is is_superuser
        if exists:
            assert not model_admin.has_add_permission(request)
        transaction.set_rollback(True)
