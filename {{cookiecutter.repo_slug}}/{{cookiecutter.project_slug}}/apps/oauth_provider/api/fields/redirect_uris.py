from oauth2_provider.settings import oauth2_settings
from oauth2_provider.validators import AllowedURIValidator
from rest_framework import serializers


class RedirectURIsField(serializers.ListField):
    """DOT keeps them as one space-separated string; the API speaks a list."""

    child = serializers.CharField(max_length=2000)

    def to_representation(self, value):
        return value.split()

    def to_internal_value(self, data):
        uris = super().to_internal_value(data)
        # As DOT's model does; nothing here calls its clean().
        validate = AllowedURIValidator(
            oauth2_settings.ALLOWED_REDIRECT_URI_SCHEMES, name="redirect uri", allow_path=True, allow_query=True
        )
        for uri in uris:
            validate(uri)
        return uris

    def run_validation(self, data=serializers.empty):
        # Joined after the list's length limits, which would otherwise count characters.
        return " ".join(super().run_validation(data))
