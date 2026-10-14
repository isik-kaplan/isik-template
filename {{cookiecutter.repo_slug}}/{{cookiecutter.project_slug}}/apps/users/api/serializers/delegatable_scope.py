from rest_framework import serializers


class DelegatableScopeSerializer(serializers.Serializer):
    """A scope a token may be given - by an application asking for it, or somebody making their own - and
    what it lets the token do, in words."""

    name = serializers.CharField(read_only=True, help_text="The scope, as a token is given it.")
    label = serializers.CharField(read_only=True, help_text="What it lets the token do.")
