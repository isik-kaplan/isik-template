from isik.django.drf.viewsets.request_policies import RequestPoliciesMixin

from apps.common.api.request_policies import RecentlyProvedWhoTheyAre


class ProvesWhoTheyAre(RequestPoliciesMixin):
    """Gates the actions named in `reauthentication_acts`; anything else is no act and passes.

    Opt-in on purpose: asking for a password on something harmless teaches people to type it at anything.
    """

    request_policies = [RecentlyProvedWhoTheyAre]

    # action -> None for the whole action, or the fields whose presence in the body makes it an act.
    reauthentication_acts = {}

    def refuse_before_proving(self, request):
        """Refuse a cheap, already-knowable precondition before asking for proof; None goes on to the gate."""
        return None
