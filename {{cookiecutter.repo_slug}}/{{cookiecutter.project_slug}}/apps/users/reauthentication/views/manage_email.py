from allauth.headless.account.views import ManageEmailView as _ManageEmailView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageEmailView(ProvesWhoTheyAre, _ManageEmailView):
    # These decide where a password reset goes; PUT only resends a verification mail.
    reauthentication_methods = frozenset({"POST", "PATCH", "DELETE"})
