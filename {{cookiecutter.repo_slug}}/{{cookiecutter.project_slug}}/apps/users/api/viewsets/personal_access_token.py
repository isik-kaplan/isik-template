from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.viewsets import BaseModelViewSet
from apps.idempotency.exemptions import NoReplay
from apps.users.api.serializers.delegatable_scope import DelegatableScopeSerializer
from apps.users.api.serializers.personal_access_token import PersonalAccessTokenSerializer
from apps.users.models import PersonalAccessToken
from apps.users.permissions import VOCABULARY


class PersonalAccessTokenViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """The signed-in person's own tokens, for a script or a command line to call the API as them. Made and
    deleted, never edited: a token that should do something else is a new one."""

    model = PersonalAccessToken
    endpoint = "personal-access-tokens"
    serializer_class = PersonalAccessTokenSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]
    reauthentication_exempt_actions = {
        "list": "reading your own tokens takes nothing from anybody",
        "retrieve": "reading your own token takes nothing from anybody",
        "destroy": "deleting a token only takes access away",
        "scopes": "reading what a token may be given takes nothing from anybody",
    }
    idempotency_no_replay_actions = {
        "create": NoReplay(reason="the answer carries the token, which is stored only as a checksum"),
    }

    def get_queryset(self):
        # By id, which a signed-out request (the API document's own) has as None rather than an error.
        return (
            PersonalAccessToken.objects.filter(user_id=self.request.user.pk)
            .prefetch_related("scopes")
            .order_by("-created_at")
        )

    # Not paginated: the vocabulary is a handful of names, answered as the plain list the document says.
    @extend_schema(responses=DelegatableScopeSerializer(many=True))
    @action(detail=False, methods=["get"], pagination_class=None)
    def scopes(self, request):
        """What the signed-in person may give a token: the delegatable permissions they hold."""
        scopes = [
            {"name": str(declaration), "label": declaration.label}
            for declaration in VOCABULARY.delegatable()
            if request.user.has_perm(declaration)
        ]
        return Response(DelegatableScopeSerializer(scopes, many=True).data)
