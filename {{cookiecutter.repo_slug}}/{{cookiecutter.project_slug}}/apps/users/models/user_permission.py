from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models.base import BaseModel


class UserPermission(BaseModel):
    """A permission given to one person directly: `User.user_permissions` goes through this."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("user"),
        help_text="Who holds the permission.",
        db_comment="The holder; the grant goes with the account.",
    )
    permission = models.ForeignKey(
        "auth.Permission",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("permission"),
        help_text="The permission they hold.",
        db_comment="The permission; a retired one takes its grants.",
    )

    class Meta:
        db_table = "users_user_user_permissions"
        verbose_name = _("user permission")
        verbose_name_plural = _("user permissions")
        constraints = [models.UniqueConstraint(fields=["user", "permission"], name="users_user_user_permissions_once")]
