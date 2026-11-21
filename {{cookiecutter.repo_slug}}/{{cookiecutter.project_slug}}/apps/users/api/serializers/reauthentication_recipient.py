from rest_framework import serializers


class ReauthenticationRecipientSerializer(serializers.Serializer):
    """Where a code may be sent: one of the two."""

    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False)
