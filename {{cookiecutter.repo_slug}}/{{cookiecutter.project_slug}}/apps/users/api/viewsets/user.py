from django_filters.rest_framework import CharFilter
from drf_spectacular.utils import extend_schema
from isik.django.drf.permissions import ReadOnly, guarding, is_owner, user_property
from isik.django.drf.viewsets import HistoryMixin, context_filter
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.serializers.reauthentication_flow import ReauthenticationFlowSerializer
from apps.users.api.serializers.user import UserSerializer
from apps.users.models.user import User
from apps.users.reauthentication.proof import ways_to_prove


def _mark_partial(serializer):
    """Split out of `update_me` so this one statement's mutants are easy to point at from
    mutation-equivalents.toml; `update_me` itself stays held to the normal kill-everything bar.

    Kept for correct PATCH semantics the day a required field is added, which is also the day
    this stops being equivalent and the mutation-equivalents.toml entries should come back off.
    """
    serializer.partial = True


class UserViewSet(HistoryMixin, BaseModelViewSet):
    """The project's accounts: staff list and read all of them, anybody else signed in only their own,
    and a signed-in user edits their own through `me`."""

    model = User
    endpoint = "users"
    serializer_class = UserSerializer
    # The history shows only UserSerializer's fields. These hidden ones still list their changes, as
    # [None, None]: a password change or a sign-in is worth seeing, never the hash or the values.
    history_shows_change_of = ["password", "last_login", "is_active", "is_staff", "is_superuser"]
    # HistoryMixin's own default assumes an integer actor pk - User.id is a uuid7.
    extra_history_filters = {"actor": context_filter("user", filter_cls=CharFilter)}
    # An account and its history are its owner's and staff's to read, nobody else's. ReadOnly is the
    # project default, restated because this list replaces it.
    permission_classes = [
        ReadOnly,
        guarding(
            IsAuthenticated & (user_property(User.is_staff) | is_owner(lambda user: user, name="IsThatUser")),
            actions=["list", "retrieve", "history"],
        ),
    ]
    # The cross-user list is everybody's for staff, and only their own for anybody else signed in.
    history_list_permission_classes = [IsAuthenticated]
    history_list_scoped_to_queryset = True

    def get_queryset(self):
        queryset = super().get_queryset()
        # Narrowed rather than guarded on retrieve too, so somebody else's id is a 404, not a hint it exists.
        if self.action in ("list", "retrieve", "history_list") and not self.request.user.is_staff:
            return queryset.filter(pk=self.request.user.pk)
        return queryset

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(self.get_serializer(request.user).data)

    # Routed by method rather than branched on one: a handler reading `request.method` itself would
    # answer a GET down the write path, which validates an empty body and saves.
    @me.mapping.patch
    def update_me(self, request):
        """How a user changes their own language preference (or name) - username/email stay
        untouchable here too, via UserSerializer's own create_only_fields."""
        serializer = self.get_serializer(request.user, data=request.data)
        _mark_partial(serializer)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # Not paginated: a handful of ways at most, answered as the plain list the document must then say.
    @extend_schema(responses=ReauthenticationFlowSerializer(many=True))
    @action(
        detail=False,
        methods=["get"],
        url_path="me/reauthentication",
        permission_classes=[IsAuthenticated],
        pagination_class=None,
    )
    def reauthentication(self, request):
        """How the signed-in person can prove it is them, for the page an act sends them to."""
        return Response(ReauthenticationFlowSerializer(ways_to_prove(request), many=True).data)
