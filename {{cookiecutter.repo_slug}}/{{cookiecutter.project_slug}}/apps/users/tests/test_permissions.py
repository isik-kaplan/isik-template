import pytest
from django.apps import apps
from django.contrib.auth.management import create_permissions
from django.contrib.auth.models import Permission
from django.core.exceptions import ImproperlyConfigured
from django.db.models.signals import post_migrate

from apps.users.apps import CREATE_PERMISSIONS_UID


@pytest.mark.django_db
def test_the_migrated_database_has_no_permissions_at_all():
    assert not Permission.objects.exists()


@pytest.mark.django_db
def test_a_post_migrate_broadcast_creates_nothing():
    """The check above would also pass if the rows were merely deleted after the fact, so this
    fires the signal that used to create them and asserts nobody is still listening."""
    for app_config in apps.get_app_configs():
        post_migrate.send(sender=app_config, app_config=app_config, verbosity=0, interactive=False, using="default")

    assert not Permission.objects.exists()


@pytest.mark.django_db
def test_the_receiver_would_otherwise_have_created_them():
    """Guards the test above against passing vacuously - if create_permissions itself stopped
    working, or the models stopped having default permissions, it would too."""
    create_permissions(apps.get_app_config("users"), verbosity=0)

    assert Permission.objects.filter(codename="add_user").exists()


def test_ready_refuses_to_pass_silently_if_djangos_uid_changes():
    """ready() has already run, so the receiver is gone and a second call finds nothing to
    disconnect - the same state a Django upgrade that renamed the uid would leave us in."""
    with pytest.raises(ImproperlyConfigured, match=CREATE_PERMISSIONS_UID):
        apps.get_app_config("users").ready()


def test_ready_disconnects_the_real_receiver_by_its_real_uid():
    """Reconnects the real receiver under the real uid first, so this only passes if ready()
    disconnects *that* dispatch_uid - a call disconnecting some other uid would find nothing here
    either, but would raise instead of silently doing the wrong lookup."""
    post_migrate.connect(create_permissions, dispatch_uid=CREATE_PERMISSIONS_UID)

    apps.get_app_config("users").ready()

    assert not post_migrate.disconnect(dispatch_uid=CREATE_PERMISSIONS_UID)
