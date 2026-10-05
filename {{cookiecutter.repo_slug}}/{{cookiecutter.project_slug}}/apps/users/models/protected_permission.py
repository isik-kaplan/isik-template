import pgtrigger
from django.contrib.auth.models import Permission


class ProtectedPermission(Permission):
    """`auth_permission` with its catalog protected in the database, since permissions here are
    hand-authored and nothing regenerates a deleted one. A proxy, so the triggers' migration lands in
    this app rather than inside `django.contrib.auth`.

    Retiring a permission on purpose goes through the documented escape hatch:

        with pgtrigger.ignore("users.ProtectedPermission:protect_permission_delete"):
            ...

    `TRUNCATE` fires no row-level trigger, so `flush` and a `transaction=True` test are unaffected.
    """

    class Meta:
        proxy = True
        triggers = [
            # Both grant tables cascade off this one, so a deleted row takes every grant of it along.
            pgtrigger.Protect(name="protect_permission_delete", operation=pgtrigger.Delete),
            # Re-pointing either silently re-aims every check naming this permission. `name` stays
            # editable: it is only ever displayed.
            pgtrigger.Protect(
                name="protect_permission_identity",
                operation=pgtrigger.Update,
                condition=pgtrigger.AnyChange("codename", "content_type"),
            ),
        ]
