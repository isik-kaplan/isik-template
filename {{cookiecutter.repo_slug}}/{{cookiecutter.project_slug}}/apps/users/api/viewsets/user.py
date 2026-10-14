from django_filters.rest_framework import CharFilter
from drf_spectacular.utils import extend_schema
from isik.django.drf.permissions import guarding
from isik.django.drf.viewsets import HistoryMixin, context_filter
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
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
    """Split out of `update_me` so this one statement's mutants are easy to point at from
    mutation-equivalents.toml; `update_me` itself stays held to the normal kill-everything bar.

    Kept for correct PATCH semantics the day a required field is added, which is also the day
    this stops being equivalent and the mutation-equivalents.toml entries should come back off.
    """
    serializer.partial = True


class UserViewSet(ProvesWhoTheyAre, HistoryMixin, BaseModelViewSet):
    """The project's accounts. Whoever may see everybody's - staff, and holders of `users:manage:user` -
    lists all of them, anybody else signed in only their own; holders of `users:manage:user` change other
    people's, and everybody edits their own through `me`."""

    model = User
    endpoint = "users"
    serializer_class = ManagedUserSerializer
    # Fields the serializer shows list their changes in the history as they are. These hidden ones still
    # list theirs, as [None, None]: a password change or a sign-in is worth seeing, never the hash or values.
    history_shows_change_of = ["password"]
    # HistoryMixin's own default assumes an integer actor pk - User.id is a uuid7.
    extra_history_filters = {"actor": context_filter("user", filter_cls=CharFilter)}
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
    # The cross-user list is everybody's for whoever sees everybody, and only their own for anybody else.
    history_list_permission_classes = [IsAuthenticated]
    history_list_scoped_to_queryset = True
    # Changing somebody else's account is the act; the rest only reads, or edits yourself, where your rank and
    # permissions are read-only.
    reauthentication_exempt_actions = {
        "list": "reading accounts takes nothing from anybody",
        "retrieve": "reading an account takes nothing from anybody",
        "history": "reading what already happened changes nothing",
        "history_list": "reading what already happened changes nothing",
        "me": "answers who is asking, which somebody being asked to prove themselves needs",
        "update_me": "editing your own name and language, where your rank and permissions are read-only",
        "reauthentication": "lists the ways to prove it is you, which proving needs first",
        "permissions": "reading what permissions exist takes nothing from anybody",
    }
    # An application holding `users:manage:user` for somebody who has it may read the accounts they can.
    token_actions = frozenset({"list", "retrieve"})

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

    # Not paginated: the vocabulary is a handful of names, answered as the plain list the document says.
    @extend_schema(responses=PermissionDeclarationSerializer(many=True))
    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated], pagination_class=None)
    def permissions(self, request):
        """Every permission there is to grant, with what it lets somebody do."""
        # Declarations are strings, so they sort by name as they are.
        declarations = sorted(VOCABULARY.by_name.values())
        return Response(PermissionDeclarationSerializer(declarations, many=True).data)
