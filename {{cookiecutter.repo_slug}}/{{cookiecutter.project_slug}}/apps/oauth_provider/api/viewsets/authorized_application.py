from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from oauth2_provider.models import get_access_token_model, get_refresh_token_model
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.oauth_provider.api.serializers.authorized_application import AuthorizedApplicationSerializer


AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()

APPLICATION_ID = OpenApiParameter("id", type=int, location=OpenApiParameter.PATH, description="The application.")


class AuthorizedApplicationViewSet(ProvesWhoTheyAre, viewsets.ViewSet):
    """The applications the signed-in person let into their account, and how to shut one out again."""

    permission_classes = [IsAuthenticated]
    serializer_class = AuthorizedApplicationSerializer
    reauthentication_exempt_actions = {"list": "reading what holds access to your own account takes nothing"}

    @extend_schema(responses=AuthorizedApplicationSerializer(many=True))
    def list(self, request):
        """Every application holding a token for this account - a refresh token too, which outlives the
        access token it came with and can mint another."""
        rows = {}
        tokens = [
            *AccessToken.objects.filter(user=request.user).select_related("application"),
            *RefreshToken.objects.filter(user=request.user, revoked__isnull=True).select_related("application"),
        ]
        for token in tokens:
            row = rows.setdefault(
                token.application_id,
                {
                    "id": token.application_id,
                    "name": token.application.name,
                    "scopes": set(),
                    "granted_at": token.created,
                },
            )
            row["scopes"].update(getattr(token, "scopes", {}))
            row["granted_at"] = min(row["granted_at"], token.created)
        answer = sorted(
            ({**row, "scopes": sorted(row["scopes"])} for row in rows.values()), key=lambda row: row["name"].lower()
        )
        return Response(AuthorizedApplicationSerializer(answer, many=True).data)

    @extend_schema(parameters=[APPLICATION_ID], responses={204: None})
    def destroy(self, request, pk=None):
        """Every token the application holds for this person, refresh tokens first and through `revoke()`:
        deleting an access token leaves its refresh token alive, and that mints a new one."""
        refresh_tokens = RefreshToken.objects.filter(user=request.user, application_id=pk, revoked__isnull=True)
        access_tokens = AccessToken.objects.filter(user=request.user, application_id=pk)
        if not refresh_tokens.exists() and not access_tokens.exists():
            return Response(status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            for refresh_token in refresh_tokens:
                refresh_token.revoke()
            # Read again here, after the refresh tokens took theirs: what is left had none.
            for access_token in access_tokens:
                access_token.revoke()
        return Response(status=status.HTTP_204_NO_CONTENT)
