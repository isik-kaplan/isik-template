from django.db.models import Q
from drf_spectacular.utils import extend_schema
from isik.django.drf.viewsets import NoPrecondition
from isik.django.drf.viewsets.registry import ViewSetRegistryExemption
from oauth2_provider.models import get_application_model
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.request_policies import NoReauthentication
from apps.common.api.viewsets import BaseModelViewSet
from apps.oauth_provider.api.permissions.may_review_applications import MayReviewApplications
from apps.oauth_provider.api.serializers.approval import ApprovalSerializer
from apps.oauth_provider.api.serializers.reviewed_application import ReviewedApplicationSerializer
from apps.oauth_provider.services import approve_application, withdraw_application


Application = get_application_model()


class ReviewedApplicationViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """Every application, for the superusers who approve and withdraw them."""

    exempt_from_registry = ViewSetRegistryExemption(
        reason="A second viewset over Application, so which audience is served is decided by the route, not the caller."
    )
    model = Application
    endpoint = "oauth-application-reviews"
    serializer_class = ReviewedApplicationSerializer
    permission_classes = [MayReviewApplications]
    # POST for approve and withdraw only.
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = {"approval": ["exact"]}
    search_fields = ["name", "user__username"]
    ordering_fields = ["name", "approval", "created"]
    # Waiting ones first, oldest first among them.
    ordering = ["-waiting", "created"]
    reauthentication_exempt_actions = {
        "list": NoReauthentication(reason="reading the applications takes nothing from anybody"),
        "retrieve": NoReauthentication(reason="reading an application takes nothing from anybody"),
        "withdraw": NoReauthentication(reason="taking an approval back only takes access away"),
        "create": NoReauthentication(
            reason="refused outright: a superuser reviews applications here, not authors them"
        ),
    }

    # Approving is not exempt: its owner may have changed the requested scopes since the page loaded.
    precondition_exempt_actions = {
        "withdraw": NoPrecondition(reason="taking an approval back only takes access away, whatever changed since"),
    }

    def get_queryset(self):
        return (
            Application.objects.select_related("user")
            .prefetch_related("requested_scopes", "approved_scopes")
            .annotate(waiting=Q(approval=Application.Approval.PENDING))
        )

    @extend_schema(exclude=True)
    def create(self, request, *args, **kwargs):
        """Refused: registering is an owner's, on oauth-applications."""
        raise MethodNotAllowed(request.method)

    @extend_schema(request=ApprovalSerializer, responses=ReviewedApplicationSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, *args, **kwargs):
        """Approve it for these of the scopes it asked for; also reinstates a withdrawn one."""
        application = self.get_object()
        if application.approval == Application.Approval.DISABLED:
            raise ValidationError({"detail": "Its owner switched it off; switching it back on is theirs to do."})
        body = ApprovalSerializer(data=request.data, context={"application": application})
        body.is_valid(raise_exception=True)
        approve_application(application, body.validated_data["approved_scopes"])
        return Response(self.get_serializer(application).data)

    @extend_schema(request=None, responses=ReviewedApplicationSerializer)
    @action(detail=True, methods=["post"])
    def withdraw(self, request, *args, **kwargs):
        """Take it down everywhere, now: every token it holds goes."""
        application = self.get_object()
        if application.approval == Application.Approval.WITHDRAWN:
            raise ValidationError({"detail": "It is already withdrawn."})
        return Response(self.get_serializer(withdraw_application(application)).data)
