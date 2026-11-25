"""The `auth.Permission` rows the vocabulary's names are stored as, for grants to a person or a group."""

from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType


def rows_named(names):
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    return PermissionRow.objects.filter(content_type=sentinel, codename__in=names)


def names_of(grants):
    """The rows themselves rather than get_*_permissions(), which answer "everything" for a superuser."""
    return sorted(permission.codename for permission in grants.all())
