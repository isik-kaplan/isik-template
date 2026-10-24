"""Writes the vocabulary into `auth_permission` on post_migrate, so a change needs no migration.

Rows hang off `auth.Permission`'s own content type as a sentinel: the column is `NOT NULL`.
"""

import pgtrigger
from django.contrib.auth import models as auth_models
from django.contrib.contenttypes.models import ContentType

from apps.users.permissions import VOCABULARY


def sync_permissions(**kwargs):
    """Rows under any other content type are left alone."""
    sentinel = ContentType.objects.get_for_model(auth_models.Permission)
    existing = {row.codename: row for row in auth_models.Permission.objects.filter(content_type=sentinel)}

    for name, declaration in VOCABULARY.by_name.items():
        row = existing.get(name)
        if row is None:
            auth_models.Permission.objects.create(content_type=sentinel, codename=name, name=declaration.label)
        elif row.name != declaration.label:
            row.name = declaration.label
            row.save(update_fields=["name"])

    stale = [row.pk for name, row in existing.items() if name not in VOCABULARY.by_name]
    if stale:
        # The only sanctioned way past the delete trigger.
        with pgtrigger.ignore("users.ProtectedPermission:protect_permission_delete"):
            auth_models.Permission.objects.filter(pk__in=stale).delete()
