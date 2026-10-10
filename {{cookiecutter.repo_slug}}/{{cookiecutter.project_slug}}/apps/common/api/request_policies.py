from django.utils.translation import gettext_lazy as _
from isik.django.drf.viewsets.request_policies import RequestPolicy
from rest_framework.exceptions import ValidationError

from apps.common.logging import REAUTHENTICATION_DEMANDED, log
from apps.users.reauthentication.gate import REAUTHENTICATION_REQUIRED_HEADER
from apps.users.reauthentication.proof import has_proven_who_they_are


class RecentlyProvedWhoTheyAre(RequestPolicy):
    """Refuses an act that removes somebody's access or widens somebody's power until the caller has
    proved, again, that they are who the session says. Applied through `ProvesWhoTheyAre`
    (apps/common/api/reauthentication.py); the allauth half of the same gate is
    apps/users/reauthentication/gate.py.

    A policy rather than a permission, because the refusal has to be told apart from an ordinary
    403: the client sends them to prove it and then back to what they were doing.
    """

    code = "reauthentication_required"
    message = _("Confirm it is you before doing this.")
    exemptions_attribute = "reauthentication_exempt_actions"

    @staticmethod
    def names_a_serious_field(request, view):
        """Whether this body is an act, for an action whose body decides: one PATCH can carry a display
        name and a field that is an act, and renaming something should not ask for a password. An
        action naming no fields is an act whatever it is sent."""
        fields = view.reauthentication_fields.get(view.action)
        return True if fields is None else bool(fields & set(request.data))

    def allows(self, request, view):
        if not self.names_a_serious_field(request, view):
            return True
        # Said now where the act would be refused anyway, so nobody proves themselves to be told
        # something knowable up front. Only ever a second chance to say no, never a way through.
        refusal = view.refuse_before_proving(request)
        if refusal is not None:
            raise ValidationError(refusal)
        return has_proven_who_they_are(request)

    def refused(self, request, view, response):
        log(REAUTHENTICATION_DEMANDED, user=str(request.user.pk), act=view.action)
        # DRF renders a permission's `detail` and never its `code`, so this is the only signal the
        # client gets about which gate stopped it.
        response[REAUTHENTICATION_REQUIRED_HEADER] = "1"
