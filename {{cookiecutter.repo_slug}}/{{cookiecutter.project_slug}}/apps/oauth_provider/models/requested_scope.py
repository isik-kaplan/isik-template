from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models.base import BaseModel


class RequestedScope(BaseModel):
    """One scope an application asks for: `Application.requested_scopes` goes through this."""

    application = models.ForeignKey(
        "oauth_provider.Application",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("application"),
        help_text="The application asking.",
        db_comment="The application; deleting it takes what it asked for.",
    )
    permission = models.ForeignKey(
        "auth.Permission",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("permission"),
        help_text="The scope asked for, as the permission it names.",
        db_comment="The permission; a retired one drops out of every request.",
    )

    class Meta:
        db_table = "oauth_provider_application_requested_scopes"
        verbose_name = _("requested scope")
        verbose_name_plural = _("requested scopes")
        constraints = [
            models.UniqueConstraint(
                fields=["application", "permission"], name="oauth_provider_application_requested_scopes_once"
            )
        ]
