"""Raw SQL throughout: the triggers must hold for a shell or a data migration too."""

import pgtrigger
import pytest
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import ProgrammingError, connection, transaction

from apps.common.db import model_db_column, model_db_name


PERMISSION = model_db_name(Permission)
CONTENT_TYPE = model_db_name(ContentType)
CODENAME = model_db_column(Permission, "codename")


def _execute(sql, params):
    # Its own savepoint, so the test's transaction survives the failure.
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(sql, params)


@pytest.fixture
def permission():
    return Permission.objects.create(
        name="probe",
        codename="probe_read_thing",
        content_type=ContentType.objects.get_for_model(Permission),
    )


@pytest.mark.django_db
def test_a_raw_delete_of_a_permission_is_refused(permission):
    with pytest.raises(ProgrammingError, match="pgtrigger"):
        _execute(f"DELETE FROM {PERMISSION} WHERE id = %s", [permission.pk])

    assert Permission.objects.filter(pk=permission.pk).exists()


@pytest.mark.django_db
def test_an_orm_delete_of_a_permission_is_refused_too(permission):
    with pytest.raises(ProgrammingError, match="pgtrigger"), transaction.atomic():
        permission.delete()

    assert Permission.objects.filter(pk=permission.pk).exists()


@pytest.mark.django_db
def test_renaming_a_permissions_codename_is_refused(permission):
    with pytest.raises(ProgrammingError, match="pgtrigger"):
        _execute(f"UPDATE {PERMISSION} SET {CODENAME} = %s WHERE id = %s", ["probe_write_thing", permission.pk])

    permission.refresh_from_db()
    assert permission.codename == "probe_read_thing"


@pytest.mark.django_db
def test_repointing_a_permission_at_another_content_type_is_refused(permission):
    other = ContentType.objects.get_for_model(ContentType)
    column = model_db_column(Permission, "content_type")

    with pytest.raises(ProgrammingError, match="pgtrigger"):
        _execute(f"UPDATE {PERMISSION} SET {column} = %s WHERE id = %s", [other.pk, permission.pk])

    permission.refresh_from_db()
    assert permission.content_type.model == "permission"


@pytest.mark.django_db
def test_the_display_name_stays_writable(permission):
    column = model_db_column(Permission, "name")

    _execute(f"UPDATE {PERMISSION} SET {column} = %s WHERE id = %s", ["probe renamed", permission.pk])

    permission.refresh_from_db()
    assert permission.name == "probe renamed"


@pytest.mark.django_db
def test_a_raw_delete_of_a_content_type_is_refused():
    content_type = ContentType.objects.get_for_model(Permission)

    with pytest.raises(ProgrammingError, match="pgtrigger"):
        _execute(f"DELETE FROM {CONTENT_TYPE} WHERE id = %s", [content_type.pk])

    assert ContentType.objects.filter(pk=content_type.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("table", [PERMISSION, CONTENT_TYPE])
def test_emptying_either_table_at_once_is_refused(table):
    """A TRUNCATE fires no row's DELETE trigger, so it has its own."""
    rows = Permission.objects.count(), ContentType.objects.count()

    with pytest.raises(ProgrammingError, match="Cannot truncate"):
        _execute(f"TRUNCATE {table} CASCADE", [])

    assert (Permission.objects.count(), ContentType.objects.count()) == rows


@pytest.mark.django_db
def test_a_content_type_can_still_be_renamed():
    """Updates stay open for `RenameContentType`."""
    # Its own row: get_for_model's cache would leak the rename into later tests.
    content_type = ContentType.objects.create(app_label="probe", model="before")
    column = model_db_column(ContentType, "model")

    _execute(f"UPDATE {CONTENT_TYPE} SET {column} = %s WHERE id = %s", ["renamed", content_type.pk])

    content_type.refresh_from_db()
    assert content_type.model == "renamed"


@pytest.mark.django_db
def test_retiring_a_permission_on_purpose_goes_through_ignore(permission):
    with pgtrigger.ignore("users.ProtectedPermission:protect_permission_delete"):
        Permission.objects.filter(pk=permission.pk).delete()

    assert not Permission.objects.filter(pk=permission.pk).exists()


@pytest.mark.django_db
def test_removing_a_content_type_on_purpose_goes_through_ignore():
    content_type = ContentType.objects.create(app_label="gone", model="removed")

    with pgtrigger.ignore("users.ProtectedContentType:protect_content_type_delete"):
        content_type.delete()

    assert not ContentType.objects.filter(app_label="gone").exists()
