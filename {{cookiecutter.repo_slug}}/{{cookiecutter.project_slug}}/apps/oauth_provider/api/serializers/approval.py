from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.users.api.fields.scope import ScopeField


class ApprovalSerializer(serializers.Serializer):
    """A superuser's answer to an application: what of what it asked for it may ask anybody for."""

    approved_scopes = ScopeField(
        many=True,
        help_text="A subset of what it requested - empty approves signing people in and nothing beyond it.",
    )

    def validate_approved_scopes(self, value):
        requested = set(self.context["application"].requested_scopes.all())
        if not set(value) <= requested:
            raise serializers.ValidationError(_("An application cannot be approved for a scope it never asked for."))
        return value
