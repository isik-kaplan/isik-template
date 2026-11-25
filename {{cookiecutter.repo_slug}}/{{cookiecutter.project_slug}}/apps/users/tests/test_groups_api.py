from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import PermissionDenied

from apps.common.links import api_path
from apps.users.api.serializers.group import GroupSerializer
from apps.users.models.group import Group
from apps.users.models.user import User
from apps.users.permission_rows import rows_named
from apps.users.permissions import Permission
from conftest import versioned


MANAGE = str(Permission.USERS_MANAGE_USER)
GRANT = str(Permission.USERS_GRANT_RIGHTS)
LIST = api_path("users:groups-list")


def _detail(group):
    return api_path("users:groups-detail", group.pk)


@pytest.fixture
def ops(db):
    return Group.objects.create(name="ops")


@pytest.fixture
def manager(signed_in, headless):
    signed_in.user_permissions.add(*rows_named([MANAGE]))
    headless.prove()
    return signed_in


@pytest.fixture
def granter(signed_in, headless):
    signed_in.is_staff = True
    signed_in.save()
    signed_in.user_permissions.add(*rows_named([GRANT]))
    headless.prove()
    return signed_in


def _post(client, data):
    return client.post(LIST, data, content_type="application/json")


def _patch(client, group, data):
    return client.patch(_detail(group), data, content_type="application/json", headers=versioned(group))


def test_a_group_reads_as_its_name(ops):
    assert str(ops) == "ops"


@pytest.mark.django_db
def test_whoever_reads_every_account_reads_the_groups_with_what_they_give(client, manager, ops):
    ops.permissions.add(*rows_named([MANAGE]))

    body = client.get(LIST).json()

    assert [(row["name"], row["permissions"]) for row in body["results"]] == [("ops", [MANAGE])]


@pytest.mark.django_db
def test_somebody_who_reads_only_their_own_account_reads_no_groups(client, signed_in, ops):
    assert client.get(LIST).status_code == 403


@pytest.mark.django_db
def test_somebody_who_may_grant_makes_a_group_of_what_they_hold(client, granter):
    response = _post(client, {"name": "support", "permissions": [MANAGE]})

    assert response.status_code == 201
    assert Group.objects.get(name="support").permissions.get().codename == MANAGE


@pytest.mark.django_db
def test_a_group_may_start_empty(client, granter):
    assert _post(client, {"name": "support"}).status_code == 201
    assert not Group.objects.get(name="support").permissions.exists()


@pytest.mark.django_db
def test_reading_every_account_is_not_changing_groups(client, manager):
    response = _post(client, {"name": "support"})

    assert response.status_code == 403
    assert response.json()["detail"] == "You cannot change groups."


@pytest.mark.django_db
def test_changing_a_group_needs_a_proof(client, signed_in):
    signed_in.is_superuser = True
    signed_in.save()

    response = _post(client, {"name": "support"})

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"


@pytest.mark.django_db
def test_renaming_a_group_keeps_what_it_gives(client, granter, ops):
    ops.permissions.add(*rows_named([MANAGE]))

    renamed = _patch(client, ops, {"name": "operations"})

    assert renamed.status_code == 200
    assert (renamed.json()["name"], renamed.json()["permissions"]) == ("operations", [MANAGE])


@pytest.mark.django_db
def test_a_group_changed_against_an_old_version_is_refused(client, granter, ops):
    headers = versioned(ops)
    ops.name = "moved-on"
    ops.save()

    response = client.patch(_detail(ops), {"name": "x"}, content_type="application/json", headers=headers)

    assert response.status_code == 412


@pytest.mark.django_db
def test_taking_a_permission_out_of_a_group_leaves_its_members_without_it(client, granter, ops):
    bob = User.objects.create_user(username="bob", email="bob@example.test")
    ops.permissions.add(*rows_named([MANAGE]))
    bob.groups.add(ops)

    response = _patch(client, ops, {"permissions": []})

    assert response.status_code == 200
    assert not User.objects.get(pk=bob.pk).has_perm(MANAGE)


@pytest.mark.django_db
def test_deleting_a_group_takes_its_memberships(client, granter, ops):
    bob = User.objects.create_user(username="bob", email="bob@example.test")
    bob.groups.add(ops)

    response = client.delete(_detail(ops), headers=versioned(ops))

    assert response.status_code == 204
    assert not bob.groups.exists()


@pytest.mark.django_db
def test_listing_groups_asks_the_same_whatever_their_number(client, manager):
    def queries():
        with CaptureQueriesContext(connection) as captured:
            client.get(LIST)
        return len(captured)

    Group.objects.create(name="one").permissions.add(*rows_named([MANAGE]))
    once = queries()
    for name in ("two", "three"):
        Group.objects.create(name=name).permissions.add(*rows_named([MANAGE]))

    assert queries() == once


@pytest.mark.django_db
@pytest.mark.parametrize("existing", [False, True])
def test_a_group_is_no_way_around_the_rule_on_granting(ops, existing):
    """Read before the permission class, as a serializer used anywhere else would be."""
    actor = User.objects.create_user(username="staff", email="staff@example.test", is_staff=True)
    serializer = GroupSerializer(
        ops if existing else None,
        data={"name": "ops" if existing else "support", "permissions": [MANAGE]},
        partial=existing,
        context={"request": SimpleNamespace(user=actor)},
    )

    with pytest.raises(PermissionDenied):
        serializer.is_valid()
