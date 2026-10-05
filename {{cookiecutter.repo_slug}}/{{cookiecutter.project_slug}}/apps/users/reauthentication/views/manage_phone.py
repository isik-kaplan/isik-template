from allauth.headless.account.views import ManagePhoneView as _ManagePhoneView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class ManagePhoneView(ProvesWhoTheyAre, _ManagePhoneView):
    # A phone number is a way to sign in wherever the project turns phone login on.
    reauthentication_methods = frozenset({"POST"})
