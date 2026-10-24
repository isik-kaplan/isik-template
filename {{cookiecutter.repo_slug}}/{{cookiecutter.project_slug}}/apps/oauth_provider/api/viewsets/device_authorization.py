from django.db import transaction
from django.db.models.functions import Now
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import OpenApiParameter, extend_schema
from isik.django.apps.idempotency.drf import IdempotencyMixin
from isik.django.drf.viewsets import NoPrecondition, PreconditionMixin
from oauth2_provider.models import get_application_model, get_device_grant_model
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
from apps.oauth_provider.api.permissions.may_answer_devices import MayAnswerDevices
from apps.oauth_provider.api.serializers.device_authorization import DeviceAuthorizationSerializer
from apps.oauth_provider.device_codes import as_stored


Application = get_application_model()
DeviceGrant = get_device_grant_model()

USER_CODE = OpenApiParameter(
    "user_code", type=str, location=OpenApiParameter.PATH, description="The code the device shows, as typed."
)
# One answer for every way a code fails, so a guesser learns nothing.
UNKNOWN = _("That code is wrong, has expired or was already answered. Start again on the device.")


class DeviceAuthorizationViewSet(ProvesWhoTheyAre, IdempotencyMixin, PreconditionMixin, viewsets.ViewSet):
    """A device asking to act for whoever enters the code it shows; allowed, its next poll gets a token."""

    permission_classes = [MayAnswerDevices]
    throttle_scope = "device_codes"
    lookup_field = "user_code"
    lookup_value_regex = "[^/]+"
    reauthentication_exempt_actions = {
        "retrieve": NoReauthentication(reason="reading what a device asks for takes nothing from anybody"),
        "approve": NoReauthentication(
            reason="the same consent the authorize page asks for, which nobody signs in again to give"
        ),
        "deny": NoReauthentication(reason="turning a device away only refuses it access it never had"),
    }
    precondition_exempt_actions = {
        "approve": NoPrecondition(reason="a code is answered once, and an answer to one already answered is refused"),
        "deny": NoPrecondition(reason="a code is answered once, and an answer to one already answered is refused"),
    }

    def _waiting(self, user_code):
        """Locked, since an answer is written straight after."""
        grant = (
            DeviceGrant.objects.select_for_update()
            .filter(
                user_code=as_stored(user_code),
                status=DeviceGrant.AUTHORIZATION_PENDING,
                expires__gt=Now(),
            )
            .first()
        )
        if grant is None:
            raise NotFound(UNKNOWN)
        application = Application.objects.filter(
            client_id=grant.client_id,
            approval=Application.Approval.APPROVED,
            authorization_grant_type=Application.GRANT_DEVICE_CODE,
        ).first()
        if application is None:
            raise NotFound(UNKNOWN)
        return grant, application

    @extend_schema(parameters=[USER_CODE], responses=DeviceAuthorizationSerializer)
    @transaction.atomic
    def retrieve(self, request, user_code=None):
        grant, application = self._waiting(user_code)
        answer = {
            "user_code": grant.user_code,
            "application_name": application.name,
            "application_description": application.description,
            "scopes": grant.scope.split(),
        }
        return Response(DeviceAuthorizationSerializer(answer).data)

    def _answer(self, user_code, answer):
        grant, _application = self._waiting(user_code)
        grant.user = self.request.user
        grant.status = answer
        grant.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(parameters=[USER_CODE], request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, user_code=None):
        """Let the device act for the signed-in person, within what it asked for."""
        return self._answer(user_code, DeviceGrant.AUTHORIZED)

    @extend_schema(parameters=[USER_CODE], request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def deny(self, request, user_code=None):
        """Turn the device away: its next poll is told no."""
        return self._answer(user_code, DeviceGrant.DENIED)
