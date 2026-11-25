from unittest.mock import patch

import pytest
from allauth.usersessions.models import UserSession
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session

from apps.common.links import api_path
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from conftest import versioned


URL = api_path("users:site-settings-current")
LoginPolicy = SiteSettings.LoginPolicy
MAIL = "apps.users.api.serializers.site_settings.tell_the_people_a_rung_signed_out.delay"


@pytest.fixture
def staff(signed_in, headless):
    signed_in.is_staff = True
    signed_in.save()
    headless.prove()
    return signed_in


@pytest.fixture
def superuser(staff):
    staff.is_superuser = True
    staff.save()
    return staff


def _a_session_of(user):
    """A signed-in session, with the row allauth writes beside it on every sign-in."""
    store = SessionStore()
    store["_auth_user_id"] = str(user.pk)
    store.create()
    UserSession.objects.create(user=user, session_key=store.session_key, ip="127.0.0.1")
    return store.session_key


def _member(name="member"):
    return User.objects.create_user(username=name, email=f"{name}@example.test")


def _patch(client, data):
    current = SiteSettings.objects.get_or_create()[0]
    return client.patch(URL, data, content_type="application/json", headers=versioned(current))


@pytest.mark.django_db
def test_staff_read_the_settings_before_anybody_saved_any(client, staff):
    response = client.get(URL)

    assert response.status_code == 200
    assert response.json()["login_policy"] == LoginPolicy.EVERYONE
    assert response.json()["signed_out"] is None
    assert response["ETag"]
    assert SiteSettings.objects.count() == 1


@pytest.mark.django_db
def test_somebody_not_staff_reads_nothing(client, signed_in):
    response = client.get(URL)

    assert response.status_code == 403
    assert response.json()["detail"] == "Only staff may do this."


@pytest.mark.django_db
def test_a_superuser_not_marked_staff_is_let_in_too(client, signed_in):
    signed_in.is_superuser = True
    signed_in.save()

    assert client.get(URL).status_code == 200


@pytest.mark.django_db
def test_raising_the_ladder_signs_out_whoever_it_shuts_out_and_says_how_many(client, staff):
    swept = _a_session_of(_member())

    response = _patch(client, {"login_policy": LoginPolicy.STAFF})

    assert response.status_code == 200
    assert response.json()["signed_out"] == 1
    assert SiteSettings.current().login_policy == LoginPolicy.STAFF
    assert not Session.objects.filter(session_key=swept).exists()


@pytest.mark.django_db
def test_only_a_superuser_may_shut_out_everybody_but_superusers(client, staff):
    response = _patch(client, {"login_policy": LoginPolicy.SUPERUSERS})

    assert response.status_code == 400
    assert response.json()["login_policy"] == [
        {"message": "Only a superuser may shut out everybody but superusers.", "code": "invalid"}
    ]
    assert SiteSettings.current().login_policy == LoginPolicy.EVERYONE


@pytest.mark.django_db
def test_a_superuser_may_choose_the_top_rung(client, superuser):
    assert _patch(client, {"login_policy": LoginPolicy.SUPERUSERS}).status_code == 200
    assert SiteSettings.current().login_policy == LoginPolicy.SUPERUSERS


@pytest.mark.django_db
@pytest.mark.parametrize(("asked", "mailed"), [(True, True), (False, False)])
def test_the_people_signed_out_are_mailed_only_when_whoever_raised_it_asks(client, staff, asked, mailed):
    _a_session_of(_member())

    with patch(MAIL) as delay:
        _patch(client, {"login_policy": LoginPolicy.STAFF, "mail_the_people_signed_out": asked})

    assert delay.called is mailed


@pytest.mark.django_db
def test_not_saying_whether_to_mail_mails_nobody(client, staff):
    _a_session_of(_member())

    with patch(MAIL) as delay:
        _patch(client, {"login_policy": LoginPolicy.STAFF})

    delay.assert_not_called()


@pytest.mark.django_db
def test_nobody_is_mailed_when_nobody_was_signed_out(client, staff):
    with patch(MAIL) as delay:
        _patch(client, {"login_policy": LoginPolicy.STAFF, "mail_the_people_signed_out": True})

    delay.assert_not_called()


@pytest.mark.django_db
def test_saving_without_moving_the_ladder_signs_nobody_out(client, staff):
    SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)
    kept = _a_session_of(_member())

    response = _patch(client, {"login_policy": LoginPolicy.STAFF})

    assert response.json()["signed_out"] == 0
    assert Session.objects.filter(session_key=kept).exists()


@pytest.mark.django_db
def test_saving_without_naming_the_rung_keeps_it_and_signs_nobody_out(client, staff):
    SiteSettings.objects.create(login_policy=LoginPolicy.STAFF)
    # A session the rung refuses but no raise ended: only a move sweeps.
    kept = _a_session_of(_member())

    response = _patch(client, {"mail_the_people_signed_out": True})

    assert (response.status_code, response.json()["signed_out"]) == (200, 0)
    assert SiteSettings.current().login_policy == LoginPolicy.STAFF
    assert Session.objects.filter(session_key=kept).exists()


@pytest.mark.django_db
def test_changing_the_settings_needs_a_proof(client, signed_in):
    signed_in.is_staff = True
    signed_in.save()

    response = _patch(client, {"login_policy": LoginPolicy.STAFF})

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"


@pytest.mark.django_db
def test_changing_them_without_naming_a_version_is_refused(client, staff):
    response = client.patch(URL, {"login_policy": LoginPolicy.STAFF}, content_type="application/json")

    assert response.status_code == 428
