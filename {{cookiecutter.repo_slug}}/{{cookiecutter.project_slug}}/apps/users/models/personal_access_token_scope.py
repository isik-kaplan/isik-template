from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models.base import BaseModel


class PersonalAccessTokenScope(BaseModel):
    """One scope a personal access token may act with: `PersonalAccessToken.scopes` goes through this."""

    token = models.ForeignKey(
        "users.PersonalAccessToken",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("token"),
        help_text="The token given the scope.",
        db_comment="The token; deleting it takes its scopes.",
    )
    permission = models.ForeignKey(
        "auth.Permission",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("permission"),
        help_text="The scope, as the permission it names.",
        db_comment="The permission; a retired one drops out of every token.",
    )

    class Meta:
        db_table = "users_personal_access_token_scopes"
        verbose_name = _("personal access token scope")
        verbose_name_plural = _("personal access token scopes")
        constraints = [
            models.UniqueConstraint(fields=["token", "permission"], name="users_personal_access_token_scopes_once")
        ]
