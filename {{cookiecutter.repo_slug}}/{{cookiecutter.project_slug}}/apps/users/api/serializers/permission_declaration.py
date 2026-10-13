from rest_framework import serializers


class PermissionDeclarationSerializer(serializers.Serializer):
    """A permission this project declares - see apps/users/permissions.py."""

    # The declaration is its own name.
    name = serializers.CharField(source="*", read_only=True, help_text="The permission, as `where:action:what`.")
    label = serializers.CharField(read_only=True, help_text="What it lets somebody do.")
    delegatable = serializers.BooleanField(
        read_only=True, help_text="Whether an application may be let act with it on somebody's behalf."
    )
    requires = serializers.ListField(
        child=serializers.CharField(), read_only=True, help_text="What holding it implies holding too."
    )
