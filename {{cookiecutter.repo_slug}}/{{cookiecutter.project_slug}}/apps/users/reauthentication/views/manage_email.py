from allauth.headless.account.views import ManageEmailView as _ManageEmailView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageEmailView(ProvesWhoTheyAre, _ManageEmailView):
    # Adding, removing and making primary decide where a password reset goes. PUT only resends a
    # verification mail to an address already on the account.
    reauthentication_methods = frozenset({"POST", "PATCH", "DELETE"})
