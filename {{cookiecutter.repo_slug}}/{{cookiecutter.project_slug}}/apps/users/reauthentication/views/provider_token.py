from allauth.headless.socialaccount.views import ProviderTokenView as _ProviderTokenView
from allauth.socialaccount.providers.base.constants import AuthProcess

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ProviderTokenView(ProvesWhoTheyAre, _ProviderTokenView):
    reauthentication_methods = frozenset({"POST"})

    def is_an_act(self):
        # Connecting hands this account another way in; a token login is only a login.
        return super().is_an_act() and self.input.cleaned_data["process"] == AuthProcess.CONNECT
