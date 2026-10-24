"""An account is changed against the version the page showed; a stale page is refused."""

import pytest
from django.contrib.auth.models import Group
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from isik.django.apps.common.db.concurrency import assert_concurrency_field_changes

from apps.users.models import PersonalAccessToken, SiteSettings
from apps.users.models.user import User
from apps.users.permissions import Permission
from apps.users.personal_access_tokens import make_token
from conftest import versioned


@pytest.fixture
def bob(db):
    return User.objects.create_user(username="bob", email="bob@example.test")


@pytest.fixture
def manager(signed_in, headless):
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    signed_in.user_permissions.add(
        *PermissionRow.objects.filter(content_type=sentinel, codename=str(Permission.USERS_MANAGE_USER))
    )
    headless.prove()
    return signed_in


def _patch(client, path, data, headers):
    return client.patch(path, data, content_type="application/json", headers=headers)


@pytest.mark.django_db
# User names its relations, so it has its own test below.
@pytest.mark.parametrize("model", [PersonalAccessToken, SiteSettings])
def test_every_version_moves_on_with_every_write_however_it_is_made(model, bob):
    instance = {
        PersonalAccessToken: lambda: make_token(user=bob, scopes=[], name="ci"),
        SiteSettings: SiteSettings.objects.create,
    }[model]()

    assert_concurrency_field_changes(instance)


@pytest.fixture
def a_permission(db):
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    return PermissionRow.objects.get(content_type=sentinel, codename=str(Permission.USERS_MANAGE_USER))


@pytest.mark.django_db
def test_their_version_moves_on_with_their_groups_and_grants_too(bob, a_permission):
    assert_concurrency_field_changes(
        bob, related={"groups": Group.objects.create(name="ops"), "user_permissions": a_permission}
    )


@pytest.mark.django_db
def test_a_grant_made_since_the_page_loaded_refuses_its_save_rather_than_being_taken_back(
    client, manager, bob, a_permission
):
    read = versioned(bob)
    bob.user_permissions.add(a_permission)

    response = _patch(client, reverse("users-detail", args=[bob.pk]), {"permissions": []}, read)

    assert response.status_code == 412
    assert response.json()["current"]["permissions"] == [str(Permission.USERS_MANAGE_USER)]
    assert bob.user_permissions.filter(pk=a_permission.pk).exists()


@pytest.mark.django_db
def test_joining_a_group_leaves_when_they_were_last_changed_alone(bob):
    before = User.objects.get(pk=bob.pk).updated_at
    bob.groups.add(Group.objects.create(name="ops"))

    assert User.objects.get(pk=bob.pk).updated_at == before


@pytest.mark.django_db
def test_deactivating_somebody_from_a_stale_page_is_refused_with_how_they_are_now(client, manager, bob):
    read = versioned(bob)
    bob.first_name = "Robert"
    bob.save()

    response = _patch(client, reverse("users-detail", args=[bob.pk]), {"is_active": False}, read)

    assert response.status_code == 412
    assert response.json()["current"]["first_name"] == "Robert"
    bob.refresh_from_db()
    assert bob.is_active is True


@pytest.mark.django_db
def test_changing_somebody_without_naming_a_version_is_refused(client, manager, bob):
    response = _patch(client, reverse("users-detail", args=[bob.pk]), {"is_active": False}, {})

    assert response.status_code == 428
    bob.refresh_from_db()
    assert bob.is_active is True


@pytest.mark.django_db
def test_two_tabs_on_your_own_profile_cannot_overwrite_each_other(client, signed_in, a_second_language):
    read = versioned(signed_in)
    assert _patch(client, reverse("users-me"), {"first_name": "Alice"}, read).status_code == 200

    response = _patch(client, reverse("users-me"), {"language": "tr"}, read)

    assert response.status_code == 412
    assert response.json()["current"]["first_name"] == "Alice"
    signed_in.refresh_from_db()
    assert signed_in.language == ""


@pytest.mark.django_db
def test_your_own_profile_answers_with_the_version_it_left(client, signed_in):
    response = _patch(client, reverse("users-me"), {"first_name": "Alice"}, versioned(signed_in))

    assert response.status_code == 200
    assert response["ETag"] == versioned(signed_in)["If-Match"]


@pytest.mark.django_db
def test_reading_yourself_carries_the_version_to_send_back(client, signed_in):
    assert client.get(reverse("users-me"))["ETag"] == versioned(signed_in)["If-Match"]


@pytest.mark.django_db
def test_reading_somebody_carries_the_version_to_send_back(client, manager, bob):
    assert client.get(reverse("users-detail", args=[bob.pk]))["ETag"] == versioned(bob)["If-Match"]


@pytest.mark.django_db
def test_deleting_a_token_needs_no_version(client, signed_in, headless):
    """Exempt: every use moves its version."""
    token = make_token(user=signed_in, scopes=[], name="ci")

    response = client.delete(reverse("personal-access-tokens-detail", args=[token.pk]))

    assert response.status_code == 204
