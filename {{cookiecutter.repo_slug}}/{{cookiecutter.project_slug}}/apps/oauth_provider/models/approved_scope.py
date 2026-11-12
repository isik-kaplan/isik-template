import pgtrigger
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models.base import BaseModel
from apps.common.triggers import BuiltTrigger
from apps.oauth_provider.sql import scopes


class ApprovedScope(BaseModel):
    """One scope a superuser let an application ask anybody for: `Application.approved_scopes` goes through
    this."""

    application = models.ForeignKey(
        "oauth_provider.Application",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("application"),
        help_text="The application approved.",
        db_comment="The application; deleting it takes its approvals.",
    )
    permission = models.ForeignKey(
        "auth.Permission",
        on_delete=models.CASCADE,
        related_name="+",
        verbose_name=_("permission"),
        help_text="The scope approved, as the permission it names.",
        db_comment="The permission; a retired one drops out of every approval.",
    )

    class Meta:
        db_table = "oauth_provider_application_approved_scopes"
        verbose_name = _("approved scope")
        verbose_name_plural = _("approved scopes")
        constraints = [
            models.UniqueConstraint(
                fields=["application", "permission"], name="oauth_provider_application_approved_scopes_once"
            )
        ]
        triggers = [
            BuiltTrigger(
                name="approved_scope_within_requested",
                when=pgtrigger.Before,
                operation=pgtrigger.Insert | pgtrigger.Update,
                declare=scopes.WITHIN_REQUESTED_DECLARE,
                build=scopes.approved_within_requested,
            ),
            # Widening goes through services.py; deleting, which only narrows, is anybody's.
            pgtrigger.Protect(
                name="approved_only_through_its_services",
                operation=pgtrigger.Insert | pgtrigger.Update,
            ),
        ]
