from allauth.headless.account.views import ChangePasswordView as _ChangePasswordView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ChangePasswordView(ProvesWhoTheyAre, _ChangePasswordView):
    reauthentication_methods = frozenset({"POST"})

    def is_an_act(self):
        # Changing a password already demands the current one in this same request, which is the
        # challenge. Setting a first one demands nothing, and a session that sets it keeps the account.
        return super().is_an_act() and not self.request.user.has_usable_password()
