"""The re-authentication gate, mixed into the allauth headless views that carry an act.

Server-side, and that is the whole point: a prompt in the frontend alone moves the check to the one
place an attacker is not - anybody holding a session can call the endpoint directly.
"""

from allauth.headless.base.response import ReauthenticationResponse

from apps.users.reauthentication.proof import has_proven_who_they_are, spend_the_proof


# DRF and allauth both answer a refusal with a status code alone, which cannot tell "prove it is you,
# then retry" apart from "you are not allowed" - this header is what the clients act on.
REAUTHENTICATION_REQUIRED_HEADER = "X-Reauthentication-Required"


def reauthentication_required(request):
    """allauth's own answer to "re-authenticate first" (a 401 listing the ways to), plus the header."""
    response = ReauthenticationResponse(request)
    response[REAUTHENTICATION_REQUIRED_HEADER] = "1"
    return response


class ProvesWhoTheyAre:
    """Mixed in ahead of an allauth headless view; `reauthentication_methods` names the HTTP methods
    on it that are acts, and `is_an_act()` narrows one further where the body decides.

    The gate runs after allauth has validated the input, so a request that would be refused anyway
    (an unknown address, the last way to sign in) is refused without a round trip to prove anything.
    """

    reauthentication_methods = frozenset()

    # Per request: set once the gate has let an act through, so the response knows to spend the proof
    # even when the act itself changed what `is_an_act()` would now answer.
    spends_a_proof = False

    def is_an_act(self):
        return self.request.method in self.reauthentication_methods

    def refuse_unproven(self):
        """None when this request may go on, or the response refusing it."""
        if not self.is_an_act():
            return None
        if not has_proven_who_they_are(self.request):
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
        # Spent on success only, so a refused act does not cost a proof somebody just went through a
        # challenge to get.
        if self.spends_a_proof and response.status_code < 400:
            spend_the_proof(request)
