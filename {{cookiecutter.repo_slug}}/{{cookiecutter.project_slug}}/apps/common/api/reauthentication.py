from isik.django.drf.viewsets.request_policies import RequestPoliciesMixin

from apps.common.api.request_policies import RecentlyProvedWhoTheyAre


class ProvesWhoTheyAre(RequestPoliciesMixin):
    """Gates every action until it is named in `reauthentication_exempt_actions` with a reason, so a
    route added later refuses rather than slips through."""

    request_policies = [RecentlyProvedWhoTheyAre]
    reauthentication_exempt_actions = {}

    # action -> fields whose presence makes a request an act; an action not named here is always gated.
    reauthentication_fields = {}

    def refuse_before_proving(self, request):
        """Refuse a cheap, already-knowable precondition before asking for proof; None goes on to the gate."""
        return None
