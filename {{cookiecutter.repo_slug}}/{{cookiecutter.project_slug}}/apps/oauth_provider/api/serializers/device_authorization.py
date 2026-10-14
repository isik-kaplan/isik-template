from rest_framework import serializers


class DeviceAuthorizationSerializer(serializers.Serializer):
    """A device waiting for somebody to let it in, as the page asking them shows it."""

    user_code = serializers.CharField(read_only=True, help_text="The code the device shows, as stored.")
    application_name = serializers.CharField(read_only=True, help_text="The application the device runs.")
    application_description = serializers.CharField(read_only=True, help_text="What it does, in its owner's words.")
    scopes = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
        help_text="What it asks for, as OAuth scopes - the sign-in ones and permissions it may act with.",
    )
