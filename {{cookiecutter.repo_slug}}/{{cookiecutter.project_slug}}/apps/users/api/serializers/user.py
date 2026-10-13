from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.common.api.serializers import BaseModelSerializer
from apps.users.models.user import User


class UserSerializer(BaseModelSerializer):
    """The signed-in person, as they see and edit themselves. Their rank and permissions are read-only here:
    nobody changes their own."""

    permissions = serializers.SerializerMethodField(
        help_text="Everything they may do, as permission names - what was granted and what that implies."
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "language",
            "is_staff",
            "is_superuser",
            "permissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["is_staff", "is_superuser"]
        create_only_fields = ["username", "email"]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_permissions(self, user):
        return sorted(user.get_all_permissions())
