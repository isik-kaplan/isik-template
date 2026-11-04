from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.exceptions import ErrorDetail

from apps.common.api.serializers import BaseModelSerializer
from apps.users.models.user import User
from apps.users.names import NAMES, NameRequirement


class UserSerializer(BaseModelSerializer):
    """The signed-in person, as they see and edit themselves; nobody changes their own rank or permissions."""

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
        create_only_fields = ["email"]

    def get_extra_kwargs(self):
        kwargs = super().get_extra_kwargs()
        # A handle is chosen once: at signup, or later by somebody who had none.
        if getattr(self.instance, "username", None):
            kwargs.setdefault("username", {})["read_only"] = True
        return kwargs

    def validate(self, attrs):
        given = {name: attrs[name] for name in NAMES if name in attrs}
        refused = NameRequirement.current().refusals(given)
        if refused:
            raise serializers.ValidationError(
                {name: [ErrorDetail(message, code=code)] for name, (message, code) in refused.items()}
            )
        return super().validate(attrs)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_permissions(self, user):
        return sorted(user.get_all_permissions())
