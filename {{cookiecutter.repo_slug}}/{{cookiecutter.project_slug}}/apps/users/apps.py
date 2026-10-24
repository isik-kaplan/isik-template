from importlib import import_module

from django.apps import AppConfig
from django.core.exceptions import ImproperlyConfigured
from django.db.models.signals import post_migrate


# The uid django.contrib.auth connects under; the only handle to disconnect it.
CREATE_PERMISSIONS_UID = "django.contrib.auth.management.create_permissions"

# ready() can run twice; the uid keeps the receiver from doubling.
SYNC_PERMISSIONS_UID = "apps.users.sync.sync_permissions"


class UsersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.users"

    def ready(self):
        # Permissions are hand-authored; Meta.default_permissions can't reach third-party models.
        if not post_migrate.disconnect(dispatch_uid=CREATE_PERMISSIONS_UID):
            raise ImproperlyConfigured(
                f"Nothing was connected to post_migrate as {CREATE_PERMISSIONS_UID!r}, so this app is no longer "
                f"suppressing Django's default permissions. Check what django.contrib.auth's AuthConfig.ready() "
                f"connects and update CREATE_PERMISSIONS_UID to match."
            )

        from apps.users.sync import sync_permissions

        # post_migrate fires per app config; unbound, this would run once per installed app.
        post_migrate.connect(sync_permissions, sender=self, dispatch_uid=SYNC_PERMISSIONS_UID)
        # Imported for their side effects (signal receivers, a schema extension); nothing else imports them.
        import_module("apps.users.receivers")
        import_module("apps.users.schema")
