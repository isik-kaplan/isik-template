from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.serializers.user import UserSerializer
from apps.users.models.user import User


class UserViewSet(BaseModelViewSet):
    model = User
    endpoint = "users"
    serializer_class = UserSerializer

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(self.get_serializer(request.user).data)
