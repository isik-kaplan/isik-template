from allauth.headless.mfa.views import ManageRecoveryCodesView as _ManageRecoveryCodesView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageRecoveryCodesView(ProvesWhoTheyAre, _ManageRecoveryCodesView):
    # A fresh set is a fresh way past the second factor, shown once to whoever asked for it.
    reauthentication_methods = frozenset({"POST"})
