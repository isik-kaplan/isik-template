from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema
from isik.django.drf.viewsets import NoPrecondition
from isik.django.drf.viewsets.registry import ViewSetRegistryExemption
from oauth2_provider.models import get_application_model
from rest_framework.decorators import action
from rest_framework.exceptions import ErrorDetail, MethodNotAllowed, ValidationError
from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.viewsets import BaseModelViewSet
from apps.oauth_provider.api.permissions.may_review_applications import MayReviewApplications
from apps.oauth_provider.api.serializers.approval import ApprovalSerializer
from apps.oauth_provider.api.serializers.reviewed_application import ReviewedApplicationSerializer
from apps.oauth_provider.services import approve_application, withdraw_application


Application = get_application_model()

TAKE_DOWN_FIRST = _("Withdraw it first: deleting it is for an application nobody is using any more.")
# Neither signs anybody in any more: one taken down by a superuser, or switched off by its owner.
OFF = (Application.Approval.WITHDRAWN, Application.Approval.DISABLED)


class ReviewedApplicationViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """Every application, for the superusers who approve, withdraw and delete them."""

    exempt_from_registry = ViewSetRegistryExemption(
        reason="A second viewset over Application, so which audience is served is decided by the route, not the caller."
    )
    model = Application
    endpoint = "application-reviews"
    serializer_class = ReviewedApplicationSerializer
    permission_classes = [MayReviewApplications]
    # POST for approve and withdraw only; DELETE for one no longer signing anybody in.
    http_method_names = ["get", "post", "delete", "head", "options"]
    filterset_fields = {"approval": ["exact"]}
    search_fields = ["name", "user__username"]
    ordering_fields = ["name", "approval", "created"]
    # Waiting ones first, oldest first among them.
    ordering = ["-waiting", "created"]
    reauthentication_acts = {"approve": None, "destroy": None}

    # Approving is not exempt: its owner may have changed the requested scopes since the page loaded.
    precondition_exempt_actions = {
        "withdraw": NoPrecondition(reason="taking an approval back only takes access away, whatever changed since"),
    }

    def refuse_before_proving(self, request):
        """Before anybody proves themselves for a delete that would be refused anyway."""
        # An id that is no number is left to the lookup's own 404, as this filter would raise on it.
        if (
            self.action == "destroy"
            and str(self.kwargs["pk"]).isdecimal()
            and Application.objects.filter(pk=self.kwargs["pk"]).exclude(approval__in=OFF).exists()
        ):
            return {"detail": ErrorDetail(TAKE_DOWN_FIRST, code="withdraw_first")}
        return None

    def perform_destroy(self, instance):
        """Its tokens and grants go with it."""
        if instance.approval not in OFF:
            raise ValidationError({"detail": TAKE_DOWN_FIRST}, code="withdraw_first")
        instance.delete()

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
            raise ValidationError(
                {"detail": "Its owner switched it off; switching it back on is theirs to do."},
                code="switched_off_by_owner",
            )
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
            raise ValidationError({"detail": "It is already withdrawn."}, code="already_withdrawn")
        return Response(self.get_serializer(withdraw_application(application)).data)
