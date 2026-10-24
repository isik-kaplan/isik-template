from allauth.headless.account.views import ChangePasswordView as _ChangePasswordView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ChangePasswordView(ProvesWhoTheyAre, _ChangePasswordView):
    reauthentication_methods = frozenset({"POST"})

    def is_an_act(self):
        # Changing demands the current password already; setting a first one demands nothing.
        return super().is_an_act() and not self.request.user.has_usable_password()
