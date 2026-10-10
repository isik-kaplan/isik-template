from isik.django.drf.viewsets.request_policies import RequestPoliciesMixin

from apps.common.api.request_policies import RecentlyProvedWhoTheyAre
from apps.users.reauthentication.proof import spend_the_proof


class ProvesWhoTheyAre(RequestPoliciesMixin):
    """The re-authentication gate, as a thing a DRF viewset carrying an act opts into.

    Fail-closed inside: every action on a viewset that mixes this in is gated until it is named in
    `reauthentication_exempt_actions` with a reason, so a route added later refuses rather than slips
    through. `test_reauthentication_gate.py` pins the whole gated set.
    """

    request_policies = [RecentlyProvedWhoTheyAre]
    reauthentication_exempt_actions = {}

    # action -> the fields whose presence makes a request an act. An action not named here is gated
    # whatever it is sent.
    reauthentication_fields = {}

    def refuse_before_proving(self, request):
        """Overridden where an act has a precondition that is cheap and already readable with a GET,
        so it is refused before a round trip to prove anything. Returns what DRF should answer with,
        or None to go on to the gate."""
        return None

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        self.spend_the_proof_on_success(request, response)
        return response

    def spend_the_proof_on_success(self, request, response):
        # Single-use: the proof buys the one act it was asked for, spent on success only so a refused
        # act does not cost a proof somebody just went through a challenge to get.
        exempt = self.action in self.request_policy_exemptions(RecentlyProvedWhoTheyAre)
        if not exempt and response.status_code < 400 and RecentlyProvedWhoTheyAre.names_a_serious_field(request, self):
            spend_the_proof(request, self.action)
