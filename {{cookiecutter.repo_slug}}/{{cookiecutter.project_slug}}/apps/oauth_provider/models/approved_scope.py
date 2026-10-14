import pgtrigger

from apps.common.triggers import BuiltTrigger
from apps.oauth_provider.models.application import Application
from apps.oauth_provider.sql import scopes


class ApprovedScope(Application.approved_scopes.through):
    """A proxy so the trigger has a model to attach to - the autodetector emits nothing for a trigger
    declared on an auto-created through model."""

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
            # Widening is a superuser's decision, made through apps/oauth_provider/services.py like the
            # approval itself. Taking one away is anybody's: it only ever narrows.
            pgtrigger.Protect(
                name="approved_only_through_its_services",
                operation=pgtrigger.Insert | pgtrigger.Update,
            ),
        ]
