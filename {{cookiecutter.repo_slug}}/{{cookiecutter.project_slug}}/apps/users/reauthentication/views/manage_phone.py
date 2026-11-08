from allauth.headless.account.views import ManagePhoneView as _ManagePhoneView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManagePhoneView(ProvesWhoTheyAre, _ManagePhoneView):
    # A new number signs in with the password once verified, so setting one is a change of who can.
    reauthentication_methods = frozenset({"POST"})

    def is_an_act(self):
        # Correcting the number signup just texted happens before there is a session to prove anything with.
        return self.request.user.is_authenticated and super().is_an_act()
