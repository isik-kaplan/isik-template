from apps.users.login_policy import admits_session


class AdmittedByLoginPolicyMixin:
    """The password half of the login ladder. `get_user` also asks this on every request, so a session
    the sweep missed stops too - hence the cached settings."""

    def user_can_authenticate(self, user):
        return super().user_can_authenticate(user) and admits_session(user)
