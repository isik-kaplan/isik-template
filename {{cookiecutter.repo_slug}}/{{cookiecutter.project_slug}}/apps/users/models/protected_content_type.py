import pgtrigger
from django.contrib.contenttypes.models import ContentType


class ProtectedContentType(ContentType):
    """`django_content_type`, which `Permission` cascades off - so answering yes to
    `remove_stale_contenttypes` could otherwise drop permissions and every grant of them.

    Updates stay open, so `RenameContentType` keeps working. A model genuinely removed deletes its
    content type through `pgtrigger.ignore("users.ProtectedContentType:protect_content_type_delete")`.
    """

    class Meta:
        proxy = True
        triggers = [pgtrigger.Protect(name="protect_content_type_delete", operation=pgtrigger.Delete)]
