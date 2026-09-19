from apps.common.api.serializers import BaseModelSerializer
from apps.users.models.user import User


class UserSerializer(BaseModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "created_at", "updated_at"]
        create_only_fields = ["username", "email"]
