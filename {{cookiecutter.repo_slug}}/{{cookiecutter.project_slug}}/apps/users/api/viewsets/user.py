from django_filters.rest_framework import CharFilter
from isik.django.drf.viewsets import HistoryMixin, context_filter
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.serializers.user import UserSerializer
from apps.users.models.user import User


class UserViewSet(HistoryMixin, BaseModelViewSet):
    model = User
    endpoint = "users"
    serializer_class = UserSerializer
    # Worth knowing the password changed, never worth serving what it changed to or from.
    history_withhold = ("password",)
    # HistoryMixin's own default assumes an integer actor pk - User.id is a uuid7.
    extra_history_filters = {"actor": context_filter("user", filter_cls=CharFilter)}

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(self.get_serializer(request.user).data)
