import pytest
from django.apps import apps
from django.contrib.auth.management import create_permissions
from django.contrib.auth.models import Permission
from django.core.exceptions import ImproperlyConfigured
from django.db.models.signals import post_migrate

from apps.users.apps import CREATE_PERMISSIONS_UID
from apps.users.permissions import VOCABULARY


def _not_declared():
    return Permission.objects.exclude(codename__in=[str(declaration) for declaration in VOCABULARY.by_name.values()])


@pytest.mark.django_db
def test_the_migrated_database_has_only_the_declared_permissions():
    assert not _not_declared().exists()


@pytest.mark.django_db
def test_a_post_migrate_broadcast_creates_nothing_beyond_them():
    """The check above would pass if rows were merely deleted afterwards."""
    for app_config in apps.get_app_configs():
        post_migrate.send(sender=app_config, app_config=app_config, verbosity=0, interactive=False, using="default")

    assert not _not_declared().exists()


@pytest.mark.django_db
def test_the_receiver_would_otherwise_have_created_them():
    """Guards the test above against passing vacuously."""
    create_permissions(apps.get_app_config("users"), verbosity=0)

    assert Permission.objects.filter(codename="add_user").exists()


def test_ready_refuses_to_pass_silently_if_djangos_uid_changes():
    """A second ready() finds nothing to disconnect, as after a Django upgrade renaming the uid."""
    with pytest.raises(ImproperlyConfigured, match=CREATE_PERMISSIONS_UID):
        apps.get_app_config("users").ready()


def test_ready_disconnects_the_real_receiver_by_its_real_uid():
    post_migrate.connect(create_permissions, dispatch_uid=CREATE_PERMISSIONS_UID)

    apps.get_app_config("users").ready()

    assert not post_migrate.disconnect(dispatch_uid=CREATE_PERMISSIONS_UID)
