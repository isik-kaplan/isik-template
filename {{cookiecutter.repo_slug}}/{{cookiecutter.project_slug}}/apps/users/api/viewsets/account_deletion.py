from django.conf import settings
from drf_spectacular.utils import extend_schema
from isik.django.apps.accounts import conf, deletion
from isik.django.apps.idempotency.drf import IdempotencyMixin, NoReplay
from isik.django.drf.viewsets import PreconditionMixin
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.users.api.serializers.account_deletion import AccountDeletionSerializer
from apps.users.api.serializers.deletion_scheduled import DeletionScheduledSerializer
from apps.users.models.user import User


class AccountDeletionViewSet(ProvesWhoTheyAre, IdempotencyMixin, PreconditionMixin, viewsets.GenericViewSet):
    """The signed-in person deleting their own account. A superuser may too: nobody else can do it for them."""

    endpoint = "account"
    permission_classes = [IsAuthenticated]
    serializer_class = AccountDeletionSerializer
    # Only drf-spectacular reads it, for the model: every action acts on the signed-in person.
    queryset = User.objects.none()
    reauthentication_acts = {"request_deletion": None}
    idempotency_no_replay_actions = {
        "request_deletion": NoReplay(
            reason="asking ends the session that asked, so a retry is signed out before it is replayed"
        ),
    }

    @extend_schema(responses=AccountDeletionSerializer)
    @action(detail=False, methods=["get"])
    def deletion(self, request):
        """What deleting the account would do, and how long there is to change one's mind."""
        after_days = conf.setting("DELETION_AFTER").days
        described = {"deletion_mode": settings.ACCOUNT_DELETION, "after_days": after_days}
        return Response(AccountDeletionSerializer(described).data)

    @extend_schema(request=None, responses={status.HTTP_202_ACCEPTED: DeletionScheduledSerializer})
    @deletion.mapping.post
    def request_deletion(self, request):
        """Signs the person out everywhere and revokes their tokens now; the account is deleted at `deletes_at`,
        unless they sign in before then."""
        deletes_at = deletion.request_deletion(request.user)
        return Response(DeletionScheduledSerializer({"deletes_at": deletes_at}).data, status=status.HTTP_202_ACCEPTED)
