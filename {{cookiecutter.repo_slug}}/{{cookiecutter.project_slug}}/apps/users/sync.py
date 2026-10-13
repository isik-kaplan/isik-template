"""Writing the declared vocabulary into `auth_permission`.

A `post_migrate` receiver rather than a data migration, so a declaration added or relabelled in code
reaches the database on the next migrate without a migration of its own.

Every permission hangs off `auth.Permission`'s own content type as a sentinel: the column is `NOT NULL`,
and these are capabilities rather than facts about a table.
"""

import pgtrigger
from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType

from apps.users.permissions import VOCABULARY


def sync_permissions(**kwargs):
    """Make `auth_permission` match the declaration. Rows under any other content type are left alone -
    this owns the sentinel, not the table."""
    sentinel = ContentType.objects.get_for_model(auth_models.Permission)
    existing = {row.codename: row for row in auth_models.Permission.objects.filter(content_type=sentinel)}

    for name, declaration in VOCABULARY.by_name.items():
        row = existing.get(name)
        if row is None:
            auth_models.Permission.objects.create(content_type=sentinel, codename=name, name=declaration.label)
        elif row.name != declaration.label:
            # The identity trigger refuses codename and content_type, so a label is all a rename can be.
            row.name = declaration.label
            row.save(update_fields=["name"])

    stale = [row.pk for name, row in existing.items() if name not in VOCABULARY.by_name]
    if stale:
        # The sync is the only thing allowed to retire a permission - everything else is refused by the
        # trigger, which would otherwise make the catalog append-only.
        with pgtrigger.ignore("users.ProtectedPermission:protect_permission_delete"):
            auth_models.Permission.objects.filter(pk__in=stale).delete()
