from allauth.headless.mfa.views import ManageWebAuthnView as _ManageWebAuthnView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageWebAuthnView(ProvesWhoTheyAre, _ManageWebAuthnView):
    # PUT only renames a passkey.
    reauthentication_methods = frozenset({"POST", "DELETE"})
