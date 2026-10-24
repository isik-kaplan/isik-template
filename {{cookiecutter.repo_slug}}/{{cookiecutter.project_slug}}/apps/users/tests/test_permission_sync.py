import pgtrigger
import pytest
from django.apps import apps as django_apps
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.db.models.signals import post_migrate
from django.test.utils import CaptureQueriesContext

from apps.users.apps import SYNC_PERMISSIONS_UID
from apps.users.permissions import Permission
from apps.users.sync import sync_permissions


@pytest.fixture
def sentinel():
    return ContentType.objects.get(app_label="auth", model="permission")


def _rows(sentinel):
    return PermissionRow.objects.filter(content_type=sentinel)


@pytest.mark.django_db
def test_every_declared_permission_exists_with_its_label(sentinel):
    assert dict(_rows(sentinel).values_list("codename", "name")) == {
        str(declaration): declaration.label for declaration in Permission.declared()
    }


@pytest.mark.django_db
def test_a_missing_permission_is_recreated_with_its_label(sentinel):
    with pgtrigger.ignore("users.ProtectedPermission:protect_permission_delete"):
        _rows(sentinel).filter(codename=Permission.USERS_MANAGE_USER).delete()

    sync_permissions()

    assert _rows(sentinel).get(codename=Permission.USERS_MANAGE_USER).name == Permission.USERS_MANAGE_USER.label


@pytest.mark.django_db
def test_the_sync_is_idempotent(sentinel):
    before = set(_rows(sentinel).values_list("pk", "codename", "name"))

    sync_permissions()

    assert set(_rows(sentinel).values_list("pk", "codename", "name")) == before


@pytest.mark.django_db
def test_a_changed_label_is_written_back_naming_the_label_and_nothing_else(sentinel):
    """The identity trigger would refuse a save that restates codename or content_type."""
    _rows(sentinel).filter(codename=Permission.USERS_MANAGE_USER).update(name="something else")

    with CaptureQueriesContext(connection) as queries:
        sync_permissions()

    (written,) = [query["sql"] for query in queries.captured_queries if query["sql"].startswith("UPDATE")]
    assert "codename" not in written
    assert "content_type" not in written
    assert _rows(sentinel).get(codename=Permission.USERS_MANAGE_USER).name == Permission.USERS_MANAGE_USER.label


@pytest.mark.django_db
def test_a_permission_no_longer_declared_is_retired(sentinel):
    retired = PermissionRow.objects.create(name="Gone", codename="gone:read:all", content_type=sentinel)

    sync_permissions()

    assert not PermissionRow.objects.filter(pk=retired.pk).exists()


@pytest.mark.django_db
def test_rows_under_another_content_type_are_left_alone():
    other = PermissionRow.objects.create(
        name="Not ours", codename="unmanaged:read:thing", content_type=ContentType.objects.get_for_model(ContentType)
    )

    sync_permissions()

    assert PermissionRow.objects.filter(pk=other.pk).exists()


def test_the_sync_is_connected_to_this_app_config_under_its_own_uid():
    config = django_apps.get_app_config("users")

    was_connected = post_migrate.disconnect(dispatch_uid=SYNC_PERMISSIONS_UID, sender=config)
    post_migrate.connect(sync_permissions, sender=config, dispatch_uid=SYNC_PERMISSIONS_UID)

    assert was_connected
