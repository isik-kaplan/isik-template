from allauth.headless.mfa.views import ManageWebAuthnView as _ManageWebAuthnView

from apps.users.reauthentication.gate import ProvesWhoTheyAre
from apps.users.second_factor import KeepingDeleteWebAuthnInput


class ManageWebAuthnView(ProvesWhoTheyAre, _ManageWebAuthnView):
    # PUT only renames a passkey.
    reauthentication_methods = frozenset({"POST", "DELETE"})
    input_class = {**_ManageWebAuthnView.input_class, "DELETE": KeepingDeleteWebAuthnInput}
