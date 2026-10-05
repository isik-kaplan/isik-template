from rest_framework import serializers


class ReauthenticationProviderSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
