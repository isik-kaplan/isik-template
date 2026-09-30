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

    @action(detail=False, methods=["get", "patch"], permission_classes=[IsAuthenticated])
    def me(self, request):
        # PATCH is how a user changes their own language preference (or name) - username/email
        # stay untouchable here too, via UserSerializer's own create_only_fields.
        if request.method == "PATCH":
            serializer = self.get_serializer(request.user, data=request.data)
            # True is currently untestable, not just unproven: nothing in UserSerializer is required
            # (id/created_at/updated_at are read-only, username/email are read-only on update via
            # create_only_fields, first_name/last_name/language are all blank=True), and
            # ModelSerializer.update() only ever sets fields actually present in the request body
            # regardless of partial - confirmed by hand, an empty-body PATCH already returns 200.
            # Kept for correct PATCH semantics the day a required field is added, which is also the
            # day this stops being equivalent and the pragma below should come back off.
            serializer.partial = True  # pragma: no mutate
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response(self.get_serializer(request.user).data)
