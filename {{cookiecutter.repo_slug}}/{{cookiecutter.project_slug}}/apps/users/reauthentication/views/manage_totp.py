from allauth.headless.mfa.views import ManageTOTPView as _ManageTOTPView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageTOTPView(ProvesWhoTheyAre, _ManageTOTPView):
    # Turning the authenticator app on or off changes what it takes to sign in to this account.
    reauthentication_methods = frozenset({"POST", "DELETE"})
