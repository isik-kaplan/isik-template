from django.conf import settings
from django.utils.translation import gettext_lazy as _
from oauth2_provider.generators import generate_client_secret
from oauth2_provider.models import get_application_model
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.oauth_provider.api.fields import RedirectURIsField


Application = get_application_model()


class ApplicationSerializer(BaseModelSerializer):
    """An application somebody registered so it can offer "Sign in with" this project to its own users.

    Only the authorization code flow, with PKCE, and never without asking: an application reaches
    nobody's account until that person consents on this project's own page.
    """

    redirect_uris = RedirectURIsField(
        min_length=1,
        max_length=10,
        help_text="Where a sign-in may return to, exactly as the application will send it.",
    )
    client_secret = serializers.SerializerMethodField(
        help_text=(
            "Only in the answer to registering a confidential application, and never again: it is stored "
            "hashed. Lost, the application is deleted and registered again."
        )
    )

    class Meta:
        model = Application
        fields = ["id", "name", "client_id", "client_type", "redirect_uris", "client_secret", "created", "updated"]
        read_only_fields = ["client_id", "created", "updated"]
        create_only_fields = ["client_type"]
        extra_kwargs = {
            "name": {"required": True, "allow_blank": False, "help_text": "Shown to everybody asked to let it in."},
            "client_type": {
                "help_text": "confidential for a server that keeps a secret, public for a browser or mobile app."
            },
        }

    def get_client_secret(self, application) -> str | None:
        return getattr(application, "issued_secret", None)

    def validate(self, attrs):
        user = self.context["request"].user
        limit = settings.OAUTH_PROVIDER_APPLICATIONS_PER_USER
        if self.instance is None and Application.objects.filter(user=user).count() >= limit:
            raise serializers.ValidationError(_("You can register at most %(limit)d applications.") % {"limit": limit})
        return attrs

    def create(self, validated_data):
        secret = generate_client_secret()
        application = super().create(
            {
                **validated_data,
                "user": self.context["request"].user,
                "client_secret": secret,
                "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
                "algorithm": Application.RS256_ALGORITHM,
                "skip_authorization": False,
            }
        )
        if application.client_type == Application.CLIENT_CONFIDENTIAL:
            application.issued_secret = secret
        return application
