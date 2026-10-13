from django.conf import settings
from django.utils.translation import gettext_lazy as _
from oauth2_provider.models import get_application_model
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.oauth_provider.api.fields.redirect_uris import RedirectURIsField
from apps.oauth_provider.api.fields.scope import ScopeField
from apps.oauth_provider.services import change_requested_scopes, register_application


Application = get_application_model()


class ApplicationSerializer(BaseModelSerializer):
    """An application somebody registered, as its owner sees it.

    Only the authorization code flow, with PKCE, and never without asking: an application reaches nobody's
    account until it is approved and that person consents on this project's own page.
    """

    redirect_uris = RedirectURIsField(
        min_length=1,
        max_length=10,
        help_text="Where a sign-in may return to, exactly as the application will send it.",
    )
    requested_scopes = ScopeField(
        many=True,
        required=False,
        help_text=(
            "What it asks to do on somebody's behalf, beyond signing them in. Each person it signs in is asked "
            "again, and a token can only ever do what that person can."
        ),
    )
    approved_scopes = ScopeField(
        many=True,
        read_only=True,
        help_text=(
            "What of that it may ask anybody for. Asking for more waits for a superuser unless nothing here does."
        ),
    )
    client_secret = serializers.SerializerMethodField(
        help_text=(
            "Only in the answer to registering a confidential application, and never again: it is stored "
            "hashed. Lost, it is rotated."
        )
    )

    class Meta:
        model = Application
        fields = [
            "id",
            "name",
            "description",
            "client_id",
            "client_type",
            "redirect_uris",
            "approval",
            "requested_scopes",
            "approved_scopes",
            "client_secret",
            "created",
            "updated",
        ]
        read_only_fields = ["client_id", "approval", "created", "updated"]
        create_only_fields = ["client_type"]
        extra_kwargs = {
            "name": {"required": True, "allow_blank": False, "help_text": "Shown to everybody asked to let it in."},
            "client_type": {
                "help_text": "confidential for a server that keeps a secret, public for a browser or mobile app."
            },
        }

    def get_client_secret(self, application) -> str | None:
        if application.client_type != Application.CLIENT_CONFIDENTIAL:
            return None
        return getattr(application, "issued_secret", None)

    def validate(self, attrs):
        user = self.context["request"].user
        limit = settings.OAUTH_PROVIDER_APPLICATIONS_PER_USER
        if self.instance is None and Application.objects.filter(user=user).count() >= limit:
            raise serializers.ValidationError(_("You can register at most %(limit)d applications.") % {"limit": limit})
        return attrs

    def create(self, validated_data):
        return register_application(
            user=self.context["request"].user,
            requested_scopes=validated_data.pop("requested_scopes", []),
            **validated_data,
        )

    def update(self, instance, validated_data):
        requested_scopes = validated_data.pop("requested_scopes", None)
        application = super().update(instance, validated_data)
        if requested_scopes is not None:
            change_requested_scopes(application, requested_scopes)
        return application
