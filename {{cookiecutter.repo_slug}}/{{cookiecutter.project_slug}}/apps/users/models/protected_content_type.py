import pgtrigger
from django.contrib.contenttypes.models import ContentType


class ProtectedContentType(ContentType):
    """`Permission` cascades off this, so `remove_stale_contenttypes` could drop grants. Updates stay open
    for `RenameContentType`; a real removal goes through `pgtrigger.ignore(...)`."""

    class Meta:
        proxy = True
        triggers = [pgtrigger.Protect(name="protect_content_type_delete", operation=pgtrigger.Delete)]
