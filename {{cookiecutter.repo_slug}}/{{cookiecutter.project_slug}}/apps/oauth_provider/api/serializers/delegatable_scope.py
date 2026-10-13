from rest_framework import serializers


class DelegatableScopeSerializer(serializers.Serializer):
    """A scope an application may ask for, and what it lets the application do, in words."""

    name = serializers.CharField(read_only=True, help_text="The scope, as an application asks for it.")
    label = serializers.CharField(read_only=True, help_text="What it lets the application do.")
