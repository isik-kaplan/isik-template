from allauth.headless.socialaccount.views import ProviderTokenView as _ProviderTokenView
from allauth.socialaccount.providers.base.constants import AuthProcess

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ProviderTokenView(ProvesWhoTheyAre, _ProviderTokenView):
    reauthentication_methods = frozenset({"POST"})

    def is_an_act(self):
        # Only a connect adds a way in.
        return super().is_an_act() and self.input.cleaned_data["process"] == AuthProcess.CONNECT
