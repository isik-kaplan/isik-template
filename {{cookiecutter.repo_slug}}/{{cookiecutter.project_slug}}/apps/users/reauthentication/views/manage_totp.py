from allauth.headless.mfa.views import ManageTOTPView as _ManageTOTPView

from apps.common.logging import REAUTHENTICATION_DEMANDED, log
from apps.users.reauthentication.gate import ProvesWhoTheyAre
from apps.users.reauthentication.proof import has_proven_who_they_are


class ManageTOTPView(ProvesWhoTheyAre, _ManageTOTPView):
    # Turning the authenticator app on or off changes what it takes to sign in to this account.
    reauthentication_methods = frozenset({"POST", "DELETE"})

    def get(self, request, *args, **kwargs):
        """A secret to scan is the start of turning the app on, so it asks for the proof first. Asked
        only at the POST, the proof would come after the scan, and the GET coming back from it would
        hand out a new secret to scan again. Checked here, not spent: the POST still spends it."""
        response = super().get(request, *args, **kwargs)
        # 404 is allauth's "not on yet, here is a secret"; anything else (on already, or adding one
        # refused outright) hands out nothing to scan.
        if response.status_code == 404 and not has_proven_who_they_are(request):
            log(REAUTHENTICATION_DEMANDED, user=str(request.user.pk), act=self.act_of(request))
            return self.refusal()
        return response
