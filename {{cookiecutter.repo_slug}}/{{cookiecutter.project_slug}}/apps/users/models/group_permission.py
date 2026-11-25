from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models.base import BaseModel


class GroupPermission(BaseModel):
    """A permission a group gives its members: `Group.permissions` goes through this."""

    group = models.ForeignKey(
        "users.Group",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("group"),
        help_text="The group that gives it.",
        db_comment="The group; deleting it takes its permissions.",
    )
    permission = models.ForeignKey(
        "auth.Permission",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("permission"),
        help_text="The permission its members hold.",
        db_comment="The permission; a retired one takes its grants.",
    )

    class Meta:
        db_table = "users_group_permissions"
        verbose_name = _("group permission")
        verbose_name_plural = _("group permissions")
        constraints = [models.UniqueConstraint(fields=["group", "permission"], name="users_group_permissions_once")]
