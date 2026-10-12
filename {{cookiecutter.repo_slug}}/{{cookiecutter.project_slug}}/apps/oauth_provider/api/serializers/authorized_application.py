from rest_framework import serializers


class AuthorizedApplicationSerializer(serializers.Serializer):
    """One application holding access to this account - not one token. A person thinks "it can see my
    email", not "it holds four tokens", and tokens are minted and rotated behind the scenes."""

    id = serializers.IntegerField(read_only=True, help_text="The application's own id, which revoking names.")
    name = serializers.CharField(read_only=True, help_text="The application's name.")
    scopes = serializers.ListField(
        child=serializers.CharField(), read_only=True, help_text="What it may see, as OAuth scopes."
    )
    # The first time it was let in, not the newest token's age: every refresh mints a new token.
    granted_at = serializers.DateTimeField(read_only=True, help_text="When it was first let in.")
