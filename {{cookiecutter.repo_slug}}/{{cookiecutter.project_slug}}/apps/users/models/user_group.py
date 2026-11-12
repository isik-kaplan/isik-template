from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models.base import BaseModel


class UserGroup(BaseModel):
    """A person's place in a group: `User.groups` goes through this, so its table is named here."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("user"),
        help_text="Who is in the group.",
        db_comment="The member; leaving goes with the account.",
    )
    group = models.ForeignKey(
        "auth.Group",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("group"),
        help_text="The group they are in.",
        db_comment="The group; deleting it takes its memberships.",
    )

    class Meta:
        db_table = "users_user_groups"
        verbose_name = _("group membership")
        verbose_name_plural = _("group memberships")
        constraints = [models.UniqueConstraint(fields=["user", "group"], name="users_user_groups_once")]
