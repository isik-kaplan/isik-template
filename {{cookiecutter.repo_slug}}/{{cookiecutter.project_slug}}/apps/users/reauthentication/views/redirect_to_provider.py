from allauth.headless.socialaccount.forms import RedirectToProviderForm
from allauth.headless.socialaccount.views import RedirectToProviderView as _RedirectToProviderView
from allauth.socialaccount.providers.base.constants import AuthProcess
from django.http import HttpResponseRedirect

from apps.users.reauthentication.gate import ProvesWhoTheyAre
from apps.users.reauthentication.proof import with_query


# allauth's own code for this refusal, which a connect flow already hands back to its callback_url.
REAUTHENTICATION_REQUIRED_ERROR = "reauthentication_required"


class RedirectToProviderView(ProvesWhoTheyAre, _RedirectToProviderView):
    """A browser navigation rather than a fetch, so a refusal is a redirect back to the page that
    started it - the same shape every other failed connect already arrives in."""

    reauthentication_methods = frozenset({"POST"})

    def handle(self, request, *args, **kwargs):
        self.form = RedirectToProviderForm(request.POST)
        refusal = self.refuse_unproven()
        return refusal if refusal is not None else super().handle(request, *args, **kwargs)

    def is_an_act(self):
        # Connecting hands this account another way in; an invalid form is allauth's to refuse.
        return super().is_an_act() and self.form.is_valid() and self.form.cleaned_data["process"] == AuthProcess.CONNECT

    def refusal(self):
        params = {"error": REAUTHENTICATION_REQUIRED_ERROR, "error_process": AuthProcess.CONNECT}
        return HttpResponseRedirect(with_query(self.form.cleaned_data["callback_url"], params))
