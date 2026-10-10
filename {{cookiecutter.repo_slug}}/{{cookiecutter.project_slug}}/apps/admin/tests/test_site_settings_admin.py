from types import SimpleNamespace
from unittest.mock import patch

import pytest
from allauth.usersessions.models import UserSession
from django.conf import settings
from django.contrib.admin.sites import site
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.urls import reverse

from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User


ADMIN_URLCONF = "{{ cookiecutter.project_slug }}.urls.admin"
HOST = {"HTTP_HOST": f"admin.{settings.PARENT_HOST}"}
LoginPolicy = SiteSettings.LoginPolicy


def _url(name, *args):
    return reverse(f"admin:users_sitesettings_{name}", args=args, urlconf=ADMIN_URLCONF)


@pytest.fixture
def superuser(client, db):
    user = User.objects.create_superuser(username="root", email="root@example.test", password="x")
    client.force_login(user)
    return user


def _a_session_of(user):
    """A signed-in session, with the row allauth writes beside it on every sign-in."""
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store.create()
    UserSession.objects.create(user=user, session_key=store.session_key, ip="127.0.0.1")
    return store.session_key


@pytest.mark.django_db
def test_the_list_goes_straight_to_creating_the_one_row(client, superuser):
    response = client.get(_url("changelist"), **HOST)

    assert response["Location"] == _url("add")


@pytest.mark.django_db
def test_the_list_goes_straight_to_the_one_row_once_it_exists(client, superuser):
    row = SiteSettings.objects.create()

    response = client.get(_url("changelist"), **HOST)

    assert response["Location"] == _url("change", row.pk)


@pytest.mark.django_db
def test_there_is_never_a_second_row_to_add_or_one_to_delete(superuser):
    admin = site._registry[SiteSettings]
    request = SimpleNamespace(user=superuser)

    assert admin.has_add_permission(request)
    SiteSettings.objects.create()
    assert not admin.has_add_permission(request)
    assert not admin.has_delete_permission(request)


@pytest.mark.parametrize(
    ("is_superuser", "offered"),
    [
        (True, [LoginPolicy.EVERYONE, LoginPolicy.STAFF, LoginPolicy.SUPERUSERS]),
        (False, [LoginPolicy.EVERYONE, LoginPolicy.STAFF]),
    ],
)
def test_only_a_superuser_may_choose_the_rung_that_shuts_out_everybody_else(is_superuser, offered):
    admin = site._registry[SiteSettings]
    request = SimpleNamespace(user=SimpleNamespace(is_superuser=is_superuser))

    field = admin.formfield_for_choice_field(SiteSettings._meta.get_field("login_policy"), request)

    assert [value for value, _ in field.choices] == offered


def test_any_other_choice_field_is_left_alone():
    admin = site._registry[SiteSettings]
    db_field = SimpleNamespace(name="other")
    request = SimpleNamespace(user=SimpleNamespace(is_superuser=False))

    with patch("django.contrib.admin.ModelAdmin.formfield_for_choice_field", return_value="field") as parent:
        assert admin.formfield_for_choice_field(db_field, request, widget=None) == "field"

    parent.assert_called_once_with(db_field, request, widget=None)


@pytest.mark.django_db
def test_raising_the_ladder_signs_out_whoever_it_shuts_out_and_says_how_many(client, superuser):
    member = User.objects.create_user(username="member", email="member@example.test")
    swept = _a_session_of(member)

    response = client.post(_url("add"), {"login_policy": LoginPolicy.STAFF}, follow=True, **HOST)

    assert SiteSettings.current().login_policy == LoginPolicy.STAFF
    assert not Session.objects.filter(session_key=swept).exists()
    assert "1 session signed out." in [str(message) for message in response.context["messages"]]


@pytest.mark.django_db
def test_the_count_reads_as_a_plural_for_more_than_one(client, superuser):
    for name in ("first", "second"):
        _a_session_of(User.objects.create_user(username=name, email=f"{name}@example.test"))

    response = client.post(_url("add"), {"login_policy": LoginPolicy.STAFF}, follow=True, **HOST)

    assert "2 sessions signed out." in [str(message) for message in response.context["messages"]]


@pytest.mark.django_db
@pytest.mark.parametrize(("asked", "mailed"), [(True, True), (False, False)])
def test_the_people_signed_out_are_mailed_only_when_whoever_raised_it_asks(client, superuser, asked, mailed):
    _a_session_of(User.objects.create_user(username="member", email="member@example.test"))
    data = {"login_policy": LoginPolicy.STAFF, **({"mail_the_people_signed_out": "on"} if asked else {})}

    with patch("apps.admin.admin.site_settings.tell_the_people_a_rung_signed_out.delay") as delay:
        client.post(_url("add"), data, **HOST)

    assert delay.called is mailed


@pytest.mark.django_db
def test_nobody_is_mailed_when_nobody_was_signed_out(client, superuser):
    with patch("apps.admin.admin.site_settings.tell_the_people_a_rung_signed_out.delay") as delay:
        client.post(_url("add"), {"login_policy": LoginPolicy.STAFF, "mail_the_people_signed_out": "on"}, **HOST)

    delay.assert_not_called()


@pytest.mark.django_db
def test_saving_without_moving_the_ladder_signs_nobody_out(client, superuser):
    row = SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)
    member = User.objects.create_user(username="member", email="member@example.test")
    kept = _a_session_of(member)

    client.post(_url("change", row.pk), {"login_policy": LoginPolicy.STAFF}, **HOST)

    assert Session.objects.filter(session_key=kept).exists()


def test_saving_hands_the_admin_everything_it_was_given():
    """BaseAdmin reads the request for its force-current-user fields, and Django's own the rest."""
    admin = site._registry[SiteSettings]
    request, obj, form = SimpleNamespace(user=None), SimpleNamespace(), SimpleNamespace()

    with (
        patch("apps.common.admin.base.BaseAdmin.save_model") as parent,
        patch.object(type(admin), "sweep_on_a_new_rung") as sweep,
    ):
        admin.save_model(request, obj, form, True)

    parent.assert_called_once_with(request, obj, form, True)
    sweep.assert_called_once_with(request, obj, form)
