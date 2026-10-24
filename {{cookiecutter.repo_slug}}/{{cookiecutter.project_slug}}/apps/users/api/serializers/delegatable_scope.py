from rest_framework import serializers


class DelegatableScopeSerializer(serializers.Serializer):
    """A scope a token may be given, and what it lets the token do."""

    name = serializers.CharField(read_only=True, help_text="The scope, as a token is given it.")
    label = serializers.CharField(read_only=True, help_text="What it lets the token do.")
