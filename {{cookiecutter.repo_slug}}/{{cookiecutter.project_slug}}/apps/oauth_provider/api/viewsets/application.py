from oauth2_provider.models import get_application_model

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.viewsets import BaseModelViewSet
from apps.idempotency.exemptions import NoReplay
from apps.oauth_provider.api.permissions import MayRegisterApplications
from apps.oauth_provider.api.serializers.application import ApplicationSerializer


Application = get_application_model()


class ApplicationViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """The applications the signed-in person registered. Who may register at all is the provider's
    mode - see apps/oauth_provider/registration.py."""

    model = Application
    endpoint = "oauth-applications"
    serializer_class = ApplicationSerializer
    permission_classes = [MayRegisterApplications]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    reauthentication_exempt_actions = {
        "list": "reading your own applications takes nothing from anybody",
        "retrieve": "reading your own application takes nothing from anybody",
    }
    # Renaming one is not an act; pointing its sign-ins somewhere else is.
    reauthentication_fields = {"partial_update": {"redirect_uris"}}
    idempotency_no_replay_actions = {
        "create": NoReplay(
            reason="the answer carries the client secret, which is stored hashed and must not be handed out twice"
        )
    }

    def get_queryset(self):
        # By id, which a signed-out request (the API document's own) has as None rather than an error.
        return Application.objects.filter(user_id=self.request.user.pk).order_by("-created")
