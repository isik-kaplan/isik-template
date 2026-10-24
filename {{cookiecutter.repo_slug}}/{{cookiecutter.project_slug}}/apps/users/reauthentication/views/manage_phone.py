from allauth.headless.account.views import ManagePhoneView as _ManagePhoneView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManagePhoneView(ProvesWhoTheyAre, _ManagePhoneView):
    reauthentication_methods = frozenset({"POST"})
