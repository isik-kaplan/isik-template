from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema
from isik.django.apps.idempotency.drf import NoReplay
from isik.django.drf.viewsets import NoPrecondition
from oauth2_provider.models import get_application_model
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
from apps.common.api.viewsets import BaseModelViewSet
from apps.oauth_provider.api.permissions.may_register_applications import MayRegisterApplications
from apps.oauth_provider.api.serializers.application import ApplicationSerializer
from apps.oauth_provider.api.serializers.rotate_secret import RotateSecretSerializer
from apps.oauth_provider.api.serializers.rotated_secret import RotatedSecretSerializer
from apps.oauth_provider.services import disable_application, restore_application, rotate_client_secret
from apps.users.api.serializers.delegatable_scope import DelegatableScopeSerializer
from apps.users.permissions import VOCABULARY


Application = get_application_model()

DISABLE_FIRST = _("Switch it off first: deleting it is for an application nobody is using any more.")
NOT_DISABLED = _("Only an application its owner switched off can be switched back on.")


class ApplicationViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """The applications the signed-in person registered. Whether a new one waits for a superuser depends on
    the provider's mode."""

    model = Application
    endpoint = "oauth-applications"
    serializer_class = ApplicationSerializer
    permission_classes = [MayRegisterApplications]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    reauthentication_exempt_actions = {
        "list": NoReauthentication(reason="reading your own applications takes nothing from anybody"),
        "retrieve": NoReauthentication(reason="reading your own application takes nothing from anybody"),
        "delegatable_scopes": NoReauthentication(
            reason="reading what an application may ask for takes nothing from anybody"
        ),
        "disable": NoReauthentication(reason="switching your own application off only takes access away"),
        "restore": NoReauthentication(reason="switching it back on gives it no more than the approval it already had"),
    }
    reauthentication_fields = {"partial_update": {"redirect_uris", "requested_scopes"}}
    # Each is refused from any state but the one it starts from, so a stale page overwrites nothing.
    precondition_exempt_actions = {
        "rotate_secret": NoPrecondition(reason="every rotation makes a new secret, so a stale page loses nothing"),
        "disable": NoPrecondition(reason="switching your own application off only takes access away"),
        "restore": NoPrecondition(reason="switching it back on gives it no more than the approval it already had"),
    }
    idempotency_no_replay_actions = {
        "create": NoReplay(
            reason="the answer carries the client secret, which is stored hashed and must not be handed out twice"
        ),
        "rotate_secret": NoReplay(
            reason="the answer carries the new client secret, and rotating again is the recovery for losing it"
        ),
    }

    def get_queryset(self):
        # By id, which a signed-out request (the API document's) has as None rather than an error.
        return (
            Application.objects.filter(user_id=self.request.user.pk)
            .prefetch_related("requested_scopes", "approved_scopes")
            .order_by("-created")
        )

    def refuse_before_proving(self, request):
        """Before anybody proves themselves for a delete that would be refused anyway."""
        if (
            self.action == "destroy"
            and self.get_queryset()
            .filter(pk=self.kwargs["pk"])
            .exclude(approval=Application.Approval.DISABLED)
            .exists()
        ):
            return {"detail": DISABLE_FIRST}
        return None

    def perform_destroy(self, instance):
        if instance.approval != Application.Approval.DISABLED:
            raise ValidationError({"detail": DISABLE_FIRST})
        instance.delete()

    @extend_schema(request=RotateSecretSerializer, responses=RotatedSecretSerializer)
    @action(detail=True, methods=["post"], url_path="rotate-secret")
    def rotate_secret(self, request, *args, **kwargs):
        """A new secret for the same client id, readable in this answer and never again."""
        application = self.get_object()
        if application.client_type != Application.CLIENT_CONFIDENTIAL:
            raise ValidationError({"detail": _("A public application has no secret to rotate.")})
        body = RotateSecretSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        secret = rotate_client_secret(application, revoke=body.validated_data["revoke_tokens"])
        return Response(RotatedSecretSerializer({"client_secret": secret}).data)

    @extend_schema(request=None, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def disable(self, request, *args, **kwargs):
        """Its owner's off switch: every token it holds goes now. The only state it may be deleted from."""
        application = self.get_object()
        if application.approval != Application.Approval.APPROVED:
            raise ValidationError({"detail": _("Only an approved application can be switched off.")})
        return Response(self.get_serializer(disable_application(application)).data)

    @extend_schema(request=None, responses=ApplicationSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, *args, **kwargs):
        application = self.get_object()
        if application.approval != Application.Approval.DISABLED:
            raise ValidationError({"detail": NOT_DISABLED})
        return Response(self.get_serializer(restore_application(application)).data)

    # Not paginated: the vocabulary is a handful of names.
    @extend_schema(responses=DelegatableScopeSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="delegatable-scopes", pagination_class=None)
    def delegatable_scopes(self, request):
        """Every scope an application may ask for beyond signing somebody in."""
        scopes = [{"name": str(declaration), "label": declaration.label} for declaration in VOCABULARY.delegatable()]
        return Response(DelegatableScopeSerializer(scopes, many=True).data)
