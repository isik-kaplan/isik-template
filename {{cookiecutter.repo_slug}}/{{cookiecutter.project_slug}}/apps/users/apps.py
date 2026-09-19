from django.apps import AppConfig
from django.core.exceptions import ImproperlyConfigured
from django.db.models.signals import post_migrate


# django.contrib.auth's own ready() connects it under this uid; matching it is the only way to
# disconnect a receiver we don't hold a reference to.
CREATE_PERMISSIONS_UID = "django.contrib.auth.management.create_permissions"


class UsersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.users"

    def ready(self):
        # Permissions are hand-authored, never generated - and this is the only lever that reaches
        # third-party and django_overlay models, neither of which Meta.default_permissions can.
        if not post_migrate.disconnect(dispatch_uid=CREATE_PERMISSIONS_UID):
            raise ImproperlyConfigured(
                f"Nothing was connected to post_migrate as {CREATE_PERMISSIONS_UID!r}, so this app is no longer "
                f"suppressing Django's default permissions. Check what django.contrib.auth's AuthConfig.ready() "
                f"connects and update CREATE_PERMISSIONS_UID to match."
            )
