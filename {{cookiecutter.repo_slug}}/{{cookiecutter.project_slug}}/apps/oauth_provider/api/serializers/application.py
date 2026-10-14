from django.conf import settings
from django.utils.translation import gettext_lazy as _
from oauth2_provider.models import get_application_model
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.oauth_provider.api.fields.redirect_uris import RedirectURIsField
from apps.oauth_provider.services import change_requested_scopes, register_application
from apps.users.api.fields.scope import ScopeField


Application = get_application_model()


class ApplicationSerializer(BaseModelSerializer):
    """An application somebody registered, as its owner sees it.

    The authorization code flow, with PKCE, or a device showing a code for somebody to enter - and never
    without asking: an application reaches nobody's account until it is approved and that person consents
    on this project's own page.
    """

    authorization_grant_type = serializers.ChoiceField(
        choices=[
            (Application.GRANT_AUTHORIZATION_CODE, "Signs people in by sending them here and back"),
            (Application.GRANT_DEVICE_CODE, "Shows a code for people to enter here - a command line"),
        ],
        # Not a default here: the API document would then call it required, defaults and all.
        required=False,
        help_text=(
            "How it signs people in: authorization-code, the default, for a website or an app that can open a "
            "browser and be sent back; the device code grant for anything that can only show a code."
        ),
    )
    redirect_uris = RedirectURIsField(
        required=False,
        max_length=10,
        help_text=(
            "Where a sign-in may return to, exactly as the application will send it. At least one for the "
            "authorization code flow; none for a device, which nothing is sent back to."
        ),
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
            "authorization_grant_type",
            "redirect_uris",
            "approval",
            "requested_scopes",
            "approved_scopes",
            "client_secret",
            "created",
            "updated",
        ]
        read_only_fields = ["client_id", "approval", "created", "updated"]
        create_only_fields = ["client_type", "authorization_grant_type"]
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
        self._validate_for_its_grant(attrs)
        return attrs

    def _validate_for_its_grant(self, attrs):
        """What each way of signing people in needs, read off what is sent or what is already stored."""
        stored = self.instance or Application()
        grant = attrs.get("authorization_grant_type", stored.authorization_grant_type)
        redirect_uris = attrs.get("redirect_uris", stored.redirect_uris)
        if grant != Application.GRANT_DEVICE_CODE:
            if not redirect_uris:
                raise serializers.ValidationError({"redirect_uris": _("Give at least one place to return to.")})
            return
        if redirect_uris:
            raise serializers.ValidationError({"redirect_uris": _("A device is never sent back anywhere.")})
        # A command line anybody can download keeps no secret, so its client id has to be enough.
        if attrs.get("client_type", stored.client_type) != Application.CLIENT_PUBLIC:
            raise serializers.ValidationError({"client_type": _("A device keeps no secret: register it as public.")})

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
