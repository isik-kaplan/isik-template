"""Changing somebody else's account: whether they may sign in, their rank, and what they may do."""

import pytest
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse

from apps.users.models.user import User
from apps.users.permissions import Permission


MANAGE = str(Permission.USERS_MANAGE_USER)
GRANT = str(Permission.USERS_GRANT_RIGHTS)


def _detail(user):
    return reverse("users-detail", args=[user.pk])


def _grant(user, *names):
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    user.user_permissions.add(*PermissionRow.objects.filter(content_type=sentinel, codename__in=names))


@pytest.fixture
def bob(db):
    return User.objects.create_user(username="bob", email="bob@example.test")


@pytest.fixture
def manager(signed_in, headless):
    _grant(signed_in, MANAGE)
    headless.prove()
    return signed_in


@pytest.fixture
def granter(signed_in, headless):
    signed_in.is_staff = True
    signed_in.save()
    _grant(signed_in, GRANT)
    headless.prove()
    return signed_in


def _patch(client, user, data):
    return client.patch(_detail(user), data, content_type="application/json")


@pytest.mark.django_db
def test_an_account_is_shown_with_its_rank_and_what_it_was_granted(client, manager, bob):
    _grant(bob, MANAGE)

    body = client.get(_detail(bob)).json()

    assert body["is_active"] is True
    assert body["is_staff"] is False
    assert body["is_superuser"] is False
    assert body["permissions"] == [MANAGE]
    assert body["last_login"] is None


@pytest.mark.django_db
def test_a_superuser_is_shown_with_what_they_were_granted_not_everything_they_hold(client, manager, bob):
    bob.is_superuser = True
    bob.save()

    assert client.get(_detail(bob)).json()["permissions"] == []


@pytest.mark.django_db
def test_the_people_list_can_be_searched_and_narrowed(client, manager, bob):
    User.objects.create_user(username="carol", email="carol@example.test", is_active=False)

    found = client.get(reverse("users-list"), {"search": "bob"}).json()["results"]
    inactive = client.get(reverse("users-list"), {"is_active": "false"}).json()["results"]

    assert [row["username"] for row in found] == ["bob"]
    assert [row["username"] for row in inactive] == ["carol"]


@pytest.mark.django_db
def test_somebody_holding_the_permission_deactivates_an_account(client, manager, bob):
    response = _patch(client, bob, {"is_active": False})

    assert response.status_code == 200
    bob.refresh_from_db()
    assert bob.is_active is False


@pytest.mark.django_db
def test_somebody_without_it_changes_nobody(client, signed_in, headless, bob):
    signed_in.is_staff = True
    signed_in.save()
    headless.prove()

    response = _patch(client, bob, {"is_active": False})

    assert response.status_code == 403
    assert response.json()["detail"] == "You cannot manage other people's accounts."


@pytest.mark.django_db
def test_changing_somebody_needs_a_proof(client, signed_in, bob):
    _grant(signed_in, MANAGE)

    response = _patch(client, bob, {"is_active": False})

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"


@pytest.mark.django_db
def test_nobody_changes_their_own_access(client, granter):
    response = _patch(client, granter, {"is_superuser": True})

    assert response.status_code == 400
    assert response.json() == {"non_field_errors": ["Somebody else changes what you may do."]}


@pytest.mark.django_db
def test_only_a_superuser_changes_a_superuser(client, manager, bob):
    bob.is_superuser = True
    bob.save()

    response = _patch(client, bob, {"is_active": False})

    assert response.status_code == 400
    assert response.json() == {"non_field_errors": ["Only a superuser changes a superuser's account."]}


@pytest.mark.django_db
def test_a_superuser_changes_another(client, signed_in, headless, bob):
    signed_in.is_superuser = True
    signed_in.save()
    headless.prove()
    bob.is_superuser = True
    bob.save()

    assert _patch(client, bob, {"is_superuser": False}).status_code == 200


@pytest.mark.django_db
def test_managing_people_is_not_granting_them_anything(client, manager, bob):
    response = _patch(client, bob, {"permissions": [MANAGE]})

    assert response.status_code == 403
    assert response.json()["detail"] == "You cannot change what other people may do."


@pytest.mark.django_db
def test_somebody_who_may_grant_hands_on_what_they_hold(client, granter, bob):
    response = _patch(client, bob, {"permissions": [MANAGE]})

    assert response.status_code == 200
    assert response.json()["permissions"] == [MANAGE]
    assert User.objects.get(pk=bob.pk).has_perm(MANAGE)


@pytest.mark.django_db
def test_the_grant_permission_goes_only_to_staff(client, granter, bob):
    refused = _patch(client, bob, {"permissions": [GRANT]})
    granted = _patch(client, bob, {"is_staff": True, "permissions": [GRANT]})

    assert refused.json() == {"permissions": ["Changing what people may do takes effect for staff only."]}
    assert granted.status_code == 200


@pytest.mark.django_db
def test_taking_a_permission_away_is_not_a_grant(client, manager, bob):
    _grant(bob, MANAGE)

    response = _patch(client, bob, {"permissions": []})

    assert response.status_code == 200
    assert not User.objects.get(pk=bob.pk).has_perm(MANAGE)


@pytest.mark.django_db
def test_a_permission_nobody_declared_is_refused(client, granter, bob):
    response = _patch(client, bob, {"permissions": ["users:delete:everything"]})

    assert response.status_code == 400
    assert "permissions" in response.json()


@pytest.mark.django_db
def test_who_somebody_is_stays_theirs_to_change(client, granter, bob):
    _patch(client, bob, {"username": "robert", "email": "robert@example.test", "first_name": "Rob"})

    bob.refresh_from_db()
    assert (bob.username, bob.email, bob.first_name) == ("bob", "bob@example.test", "")


@pytest.mark.django_db
def test_a_person_sees_their_own_rank_and_permissions_and_cannot_change_them(client, signed_in):
    _grant(signed_in, GRANT)

    body = client.patch(reverse("users-me"), {"is_superuser": True}, content_type="application/json").json()

    assert body["is_superuser"] is False
    assert body["permissions"] == [GRANT, MANAGE]


@pytest.mark.django_db
def test_every_permission_there_is_to_grant_is_listed_with_what_it_does(client, signed_in):
    response = client.get(reverse("users-permissions"))

    assert response.json() == [
        {
            "name": GRANT,
            "label": "Change what other people may do",
            "delegatable": True,
            "requires": [MANAGE],
        },
        {
            "name": MANAGE,
            "label": "See everybody's account, and activate or deactivate them",
            "delegatable": True,
            "requires": [],
        },
    ]


@pytest.mark.django_db
@pytest.mark.parametrize("rank", ["is_staff", "is_superuser"])
def test_raising_somebodys_rank_is_a_grant(client, manager, bob, rank):
    response = _patch(client, bob, {rank: True})

    assert response.status_code == 403
    assert response.json()["detail"] == "You cannot change what other people may do."


@pytest.mark.django_db
def test_keeping_somebody_staff_who_already_is_grants_nothing(client, manager, bob):
    bob.is_staff = True
    bob.save()

    assert _patch(client, bob, {"is_staff": True}).status_code == 200


@pytest.mark.django_db
def test_lowering_somebodys_rank_is_not_a_grant(client, manager, bob):
    bob.is_staff = True
    bob.save()

    assert _patch(client, bob, {"is_staff": False}).status_code == 200
    assert not User.objects.get(pk=bob.pk).is_staff


@pytest.mark.django_db
def test_only_a_superuser_makes_a_superuser(client, granter, bob):
    response = _patch(client, bob, {"is_superuser": True})

    assert response.json() == {"is_superuser": ["You cannot make somebody a superuser."]}


@pytest.mark.django_db
def test_somebody_already_staff_may_be_given_the_grant_permission_on_its_own(client, granter, bob):
    bob.is_staff = True
    bob.save()

    response = _patch(client, bob, {"permissions": [GRANT]})

    assert response.status_code == 200
    assert response.json()["permissions"] == [GRANT]


@pytest.mark.django_db
def test_a_grant_names_the_declared_permission_and_no_namesake(client, granter, bob):
    """A row of the same codename under another content type - a third-party app's, say - is not it."""
    PermissionRow.objects.create(
        content_type=ContentType.objects.get_for_model(User), codename=MANAGE, name="A namesake"
    )

    response = _patch(client, bob, {"permissions": [MANAGE]})

    assert response.json()["permissions"] == [MANAGE]
