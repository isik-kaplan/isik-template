from rest_framework import serializers

from apps.users.api.serializers.reauthentication_provider import ReauthenticationProviderSerializer
from apps.users.api.serializers.reauthentication_recipient import ReauthenticationRecipientSerializer


class ReauthenticationFlowSerializer(serializers.Serializer):
    """One way to prove it is you. Only the fields its flow carries are sent."""

    # Not a choice: allauth adds flows as its apps are installed, and a client skips unknown ones.
    id = serializers.CharField()
    types = serializers.ListField(child=serializers.CharField(), required=False)
    providers = ReauthenticationProviderSerializer(many=True, required=False)
    email = serializers.EmailField(required=False)
    recipients = ReauthenticationRecipientSerializer(many=True, required=False)
