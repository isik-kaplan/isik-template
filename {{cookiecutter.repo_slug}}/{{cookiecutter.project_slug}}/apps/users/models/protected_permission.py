import pgtrigger
from django.contrib.auth.models import Permission
from isik.django.apps.common.db import ProtectTruncate


class ProtectedPermission(Permission):
    """Nothing regenerates a deleted hand-authored permission. A proxy so the migration lands in this app;
    retiring one goes through `pgtrigger.ignore(...)`."""

    class Meta:
        proxy = True
        triggers = [
            # Both grant tables cascade off this one.
            pgtrigger.Protect(name="protect_permission_delete", operation=pgtrigger.Delete),
            ProtectTruncate(name="protect_permission_truncate"),
            # Re-pointing either silently re-aims every check; `name` is display-only.
            pgtrigger.Protect(
                name="protect_permission_identity",
                operation=pgtrigger.Update,
                condition=pgtrigger.AnyChange("codename", "content_type"),
            ),
        ]
