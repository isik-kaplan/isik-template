from allauth.headless.usersessions.views import SessionsView as _SessionsView

from apps.users.reauthentication.gate import ProvesWhoTheyAre


class SessionsView(ProvesWhoTheyAre, _SessionsView):
    reauthentication_methods = frozenset({"DELETE"})

    def is_an_act(self):
        # Ending only the session making the request is signing out, which nobody needs to prove.
        current = self.request.session.session_key
        return super().is_an_act() and any(
            session.session_key != current for session in self.input.cleaned_data["sessions"]
        )
