from rest_framework import serializers


class RotatedSecretSerializer(serializers.Serializer):
    """The new client secret, the one time it is readable."""

    client_secret = serializers.CharField(
        read_only=True, help_text="Shown once, here. It is stored hashed, so this is the only copy."
    )
