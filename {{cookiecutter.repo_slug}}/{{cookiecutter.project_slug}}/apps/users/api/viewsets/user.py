from drf_spectacular.utils import extend_schema
from isik.django.drf.permissions import guarding
from isik.django.drf.viewsets import HistoryMixin
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.permissions.may_manage_users import MayManageUsers
from apps.users.api.serializers.managed_user import ManagedUserSerializer
from apps.users.api.serializers.permission_declaration import PermissionDeclarationSerializer
from apps.users.api.serializers.reauthentication_flow import ReauthenticationFlowSerializer
from apps.users.api.serializers.user import UserSerializer
from apps.users.models.user import User
from apps.users.permissions import VOCABULARY
from apps.users.reauthentication.proof import ways_to_prove


def _mark_partial(serializer):
    """Split out so mutation-equivalents.toml can name its mutants; they stop being equivalent once
    UserSerializer gains a required field."""
    serializer.partial = True


class UserViewSet(ProvesWhoTheyAre, HistoryMixin, BaseModelViewSet):
    """The project's accounts. Staff and holders of `users:manage:user` see everybody's, others only their own;
    holders of `users:manage:user` change other people's, and everybody edits their own through `me`."""

    model = User
    endpoint = "users"
    serializer_class = ManagedUserSerializer
    # Hidden fields whose changes still show in the history, as [None, None].
    history_shows_change_of = ["password"]
    permission_classes = [
        IsAuthenticated,
        guarding(MayManageUsers, actions=["partial_update"], message=MayManageUsers.message),
    ]
    # No create or delete: accounts are made by signing up and kept, deactivated rather than deleted.
    http_method_names = ["get", "patch", "head", "options"]
    filterset_fields = {"is_active": ["exact"], "is_staff": ["exact"], "is_superuser": ["exact"]}
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["username", "email", "created_at", "last_login"]
    ordering = ["username"]
    history_list_permission_classes = [IsAuthenticated]
    history_list_scoped_to_queryset = True
    reauthentication_exempt_actions = {
        "list": NoReauthentication(reason="reading accounts takes nothing from anybody"),
        "retrieve": NoReauthentication(reason="reading an account takes nothing from anybody"),
        "history": NoReauthentication(reason="reading what already happened changes nothing"),
        "history_list": NoReauthentication(reason="reading what already happened changes nothing"),
        "me": NoReauthentication(reason="answers who is asking, which somebody being asked to prove themselves needs"),
        "update_me": NoReauthentication(
            reason="editing your own name and language, where your rank and permissions are read-only"
        ),
        "reauthentication": NoReauthentication(reason="lists the ways to prove it is you, which proving needs first"),
        "permissions": NoReauthentication(reason="reading what permissions exist takes nothing from anybody"),
    }
    # An application holding `users:manage:user` for somebody who has it may read the accounts they can.
    token_actions = frozenset({"list", "retrieve"})
    # Read actions are the only ones that send the version as ETag.
    precondition_read_actions = ("retrieve", "me")

    def get_serializer_class(self):
        if self.action in ("me", "update_me"):
            return UserSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        queryset = super().get_queryset().prefetch_related("user_permissions")
        # Narrowed rather than refused, so somebody else's id is a 404, not a hint it exists.
        if not getattr(self.request.user, "may_see_every_account", False):
            return queryset.filter(pk=self.request.user.pk)
        return queryset

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(self.get_serializer(self._own_row()).data)

    def _own_row(self):
        """Through get_object(), so reading sends the version and writing checks If-Match against it."""
        self.kwargs[self.lookup_url_kwarg or self.lookup_field] = self.request.user.pk
        return self.get_object()

    # Routed by method, not branched on `request.method`, which would send a GET down the write path.
    @me.mapping.patch
    def update_me(self, request):
        """The signed-in person changes their own name or language."""
        serializer = self.get_serializer(self._own_row(), data=request.data)
        _mark_partial(serializer)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

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

    @extend_schema(responses=PermissionDeclarationSerializer(many=True))
    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated], pagination_class=None)
    def permissions(self, request):
        """Every permission there is to grant, with what it lets somebody do."""
        declarations = sorted(VOCABULARY.by_name.values())
        return Response(PermissionDeclarationSerializer(declarations, many=True).data)
