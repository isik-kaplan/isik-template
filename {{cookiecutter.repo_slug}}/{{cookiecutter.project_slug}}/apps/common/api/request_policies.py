from django.utils.translation import gettext_lazy as _
from isik.common.utils.exemptions import exemption_class
from isik.django.drf.viewsets.request_policies import RequestPolicy, RequestPolicyExemption
from rest_framework.exceptions import ValidationError

from apps.common.logging import REAUTHENTICATION_DEMANDED, log
from apps.users.reauthentication.gate import REAUTHENTICATION_REQUIRED_HEADER
from apps.users.reauthentication.proof import has_proven_who_they_are, spend_the_proof


NoReauthentication = exemption_class(
    "NoReauthentication",
    rule="reauthentication.exempt-action",
    why="An act that removes somebody's access or widens somebody's power asks them to prove who they are again first.",
    base=RequestPolicyExemption,
)


class RecentlyProvedWhoTheyAre(RequestPolicy):
    """Refuses an act that removes access or widens power until the caller proves who they are again.

    A policy rather than a permission, so the client can tell this refusal from an ordinary 403.
    """

    code = "reauthentication_required"
    message = _("Confirm it is you before doing this.")
    exemptions_attribute = "reauthentication_exempt_actions"
    exemption_type = NoReauthentication

    @staticmethod
    def names_a_serious_field(request, view):
        """Whether this body is an act: renaming something in a PATCH should not ask for a password."""
        # A setting's own policy runs on isik's SettingViewSet, which names no fields: every change is an act.
        fields = getattr(view, "reauthentication_fields", {}).get(view.action)
        return True if fields is None else bool(fields & set(request.data))

    def allows(self, request, view):
        if not self.names_a_serious_field(request, view):
            return True
        # Only ever a second chance to say no, never a way through.
        refusal = view.refuse_before_proving(request) if hasattr(view, "refuse_before_proving") else None
        if refusal is not None:
            raise ValidationError(refusal)
        return has_proven_who_they_are(request)

    def succeeded(self, request, view, response):
        # Single-use, and spent on success only, so a refused act doesn't cost a proof just earned.
        if self.names_a_serious_field(request, view):
            spend_the_proof(request, view.action)

    def refused(self, request, view, response):
        log(REAUTHENTICATION_DEMANDED, user=str(request.user.pk), act=view.action)
        # DRF drops a permission's `code`, so this is how the client knows which gate stopped it.
        response[REAUTHENTICATION_REQUIRED_HEADER] = "1"
