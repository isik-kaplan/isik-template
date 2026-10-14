from isik.django.drf.serializers.registry import SerializerRegistryExemption
from oauth2_provider.models import get_application_model
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.oauth_provider.api.fields.redirect_uris import RedirectURIsField
from apps.users.api.fields.scope import ScopeField


Application = get_application_model()


class ReviewedApplicationSerializer(BaseModelSerializer):
    """An application as a superuser reviewing it sees it: whose it is, where it signs people in to, and
    what it asks for beside what it was let have."""

    exempt_from_registry = SerializerRegistryExemption(
        reason="A second serializer over Application, for the superusers reviewing them rather than the owner."
    )

    redirect_uris = RedirectURIsField(read_only=True, help_text="Where a sign-in may return to.")
    requested_scopes = ScopeField(many=True, read_only=True, help_text="What it asks to do on somebody's behalf.")
    approved_scopes = ScopeField(many=True, read_only=True, help_text="What of that it may ask anybody for.")
    owner = serializers.CharField(source="user.username", read_only=True, help_text="Who registered it.")

    class Meta:
        model = Application
        fields = [
            "id",
            "name",
            "description",
            "client_id",
            "client_type",
            "authorization_grant_type",
            "redirect_uris",
            "approval",
            "owner",
            "requested_scopes",
            "approved_scopes",
            "created",
            "updated",
        ]
        read_only_fields = fields
