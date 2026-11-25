from django.db import models
from django.utils.translation import gettext_lazy as _
from isik.django.apps.common.db import track_events

from apps.common.models.base import BaseModel
from apps.users.permission_rows import names_of


@track_events()
class Group(BaseModel):
    """A named set of permissions its members hold. The project's own rather than auth's, so a write names its
    version."""

    name = models.CharField(
        max_length=150,
        unique=True,
        verbose_name=_("name"),
        help_text=_("What the group is called."),
        db_comment="The group's name, unique.",
    )
    permissions = models.ManyToManyField(
        "auth.Permission",
        through="users.GroupPermission",
        related_name="+",
        blank=True,
        verbose_name=_("permissions"),
        help_text=_("What everybody in the group holds."),
    )

    # The version covers its permissions, so a stale page can't quietly undo a grant.
    concurrency_relations = ("permissions",)

    class Meta:
        db_table = "users_group"
        verbose_name = _("group")
        verbose_name_plural = _("groups")

    def __str__(self):
        return self.name

    @property
    def permission_names(self):
        return names_of(self.permissions)
