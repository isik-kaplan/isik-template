from drf_spectacular.utils import extend_schema
from isik.django.apps.idempotency.drf import NoReplay
from isik.django.drf.viewsets import NoPrecondition
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.serializers.delegatable_scope import DelegatableScopeSerializer
from apps.users.api.serializers.personal_access_token import PersonalAccessTokenSerializer
from apps.users.models import PersonalAccessToken
from apps.users.permissions import VOCABULARY


class PersonalAccessTokenViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """The signed-in person's own tokens for calling the API as them. Made and deleted, never edited."""

    model = PersonalAccessToken
    endpoint = "personal-access-tokens"
    serializer_class = PersonalAccessTokenSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]
    reauthentication_exempt_actions = {
        "list": NoReauthentication(reason="reading your own tokens takes nothing from anybody"),
        "retrieve": NoReauthentication(reason="reading your own token takes nothing from anybody"),
        "destroy": NoReauthentication(reason="deleting a token only takes away the access it gave"),
        "scopes": NoReauthentication(reason="reading what a token may be given takes nothing from anybody"),
    }
    # Every use stamps last_used_at, so a version-checked delete would fail on a token in use.
    precondition_exempt_actions = {
        "destroy": NoPrecondition(reason="deleting a token only takes access away, however it was used since"),
    }
    idempotency_no_replay_actions = {
        "create": NoReplay(reason="the answer carries the token, which is stored only as a checksum"),
    }

    def get_queryset(self):
        # By id: a signed-out request (the schema's own) has None rather than an error.
        return (
            PersonalAccessToken.objects.filter(user_id=self.request.user.pk)
            .prefetch_related("scopes")
            .order_by("-created_at")
        )

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
