from rest_framework import serializers

from apps.users.api.serializers.reauthentication_provider import ReauthenticationProviderSerializer


class ReauthenticationFlowSerializer(serializers.Serializer):
    """One way to prove it is you - see `ways_to_prove()`. Only the fields its flow carries are sent."""

    # Open-ended rather than a choice: allauth adds flows of its own (a second factor) as its apps are
    # installed, and a client skips one it does not know.
    id = serializers.CharField()
    types = serializers.ListField(child=serializers.CharField(), required=False)
    providers = ReauthenticationProviderSerializer(many=True, required=False)
    email = serializers.EmailField(required=False)
