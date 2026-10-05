from allauth.headless.socialaccount.views import ManageProvidersView as _ManageProvidersView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageProvidersView(ProvesWhoTheyAre, _ManageProvidersView):
    reauthentication_methods = frozenset({"DELETE"})
