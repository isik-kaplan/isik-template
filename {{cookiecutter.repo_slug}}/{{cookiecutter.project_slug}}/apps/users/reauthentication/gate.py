"""The server-side re-authentication gate: anybody holding a session can skip a frontend prompt."""

from allauth.headless.base.response import ReauthenticationResponse

from apps.common.logging import REAUTHENTICATION_DEMANDED, log
from apps.users.reauthentication.proof import has_proven_who_they_are, spend_the_proof


# A status code alone can't tell "prove it is you" from "not allowed".
REAUTHENTICATION_REQUIRED_HEADER = "X-Reauthentication-Required"


def reauthentication_required(request):
    """allauth's 401 listing the ways to re-authenticate, plus the header."""
    response = ReauthenticationResponse(request)
    response[REAUTHENTICATION_REQUIRED_HEADER] = "1"
    return response


class ProvesWhoTheyAre:
    """Runs after allauth validates input, so a request refused anyway costs no proof round trip."""

    reauthentication_methods = frozenset()

    # Set at the gate, since the act itself may change what `is_an_act()` answers afterwards.
    spends_a_proof = False

    def is_an_act(self):
        return self.request.method in self.reauthentication_methods

    def act_of(self, request):
        return f"{type(self).__name__}.{request.method}"

    def refuse_unproven(self):
        """None, or the refusal."""
        if not self.is_an_act():
            return None
        if not has_proven_who_they_are(self.request):
            # Not in `refusal()`, which views override.
            log(REAUTHENTICATION_DEMANDED, user=str(self.request.user.pk), act=self.act_of(self.request))
            return self.refusal()
        self.spends_a_proof = True
        return None

    def refusal(self):
        return reauthentication_required(self.request)

    def handle_input(self, data):
        invalid = super().handle_input(data)
        return invalid if invalid is not None else self.refuse_unproven()

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        self.spend_the_proof_on_success(request, response)
        return response

    def spend_the_proof_on_success(self, request, response):
        # A refused act doesn't cost the proof.
        if self.spends_a_proof and response.status_code < 400:
            spend_the_proof(request, self.act_of(request))
