import pgtrigger

from apps.common.triggers import BuiltTrigger
from apps.oauth_provider.models.application import Application
from apps.oauth_provider.sql import scopes


class ApprovedScope(Application.approved_scopes.through):
    """The autodetector emits nothing for a trigger on an auto-created through model."""

    class Meta:
        proxy = True
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
