from allauth.headless.mfa.views import ManageTOTPView as _ManageTOTPView

from apps.common.logging import REAUTHENTICATION_DEMANDED, log
from apps.users.reauthentication.gate import ProvesWhoTheyAre
from apps.users.reauthentication.proof import has_proven_who_they_are


class ManageTOTPView(ProvesWhoTheyAre, _ManageTOTPView):
    reauthentication_methods = frozenset({"POST", "DELETE"})

    def get(self, request, *args, **kwargs):
        """Checked before the secret, or returning from the proof would hand out a new one; the POST spends it."""
        response = super().get(request, *args, **kwargs)
        # 404 is allauth's "not on yet, here is a secret".
        if response.status_code == 404 and not has_proven_who_they_are(request):
            log(REAUTHENTICATION_DEMANDED, user=str(request.user.pk), act=self.act_of(request))
            return self.refusal()
        return response
