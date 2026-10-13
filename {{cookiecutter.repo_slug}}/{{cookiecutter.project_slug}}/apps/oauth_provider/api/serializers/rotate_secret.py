from rest_framework import serializers


class RotateSecretSerializer(serializers.Serializer):
    """Whether the tokens already handed out go down with the old secret."""

    revoke_tokens = serializers.BooleanField(
        default=False,
        help_text=(
            "Tokens already minted keep working until they expire, because they do not carry the secret. Set "
            "this when the old one may be in somebody else's hands."
        ),
    )
