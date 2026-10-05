from allauth.headless.mfa.views import ManageWebAuthnView as _ManageWebAuthnView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManageWebAuthnView(ProvesWhoTheyAre, _ManageWebAuthnView):
    # Adding or removing a passkey changes what it takes to sign in. PUT only renames one.
    reauthentication_methods = frozenset({"POST", "DELETE"})
