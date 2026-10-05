from apps.users.login_policy import admits_signing_in


class AdmittedByLoginPolicyMixin:
    """The password half of the login ladder, on every backend that checks a password - so a sign-in
    refused by one cannot get in through another. The social half is in
    `SocialAccountAdapter.pre_social_login`.

    `user_can_authenticate` is also what `ModelBackend.get_user` asks of a session's user on every
    request, so a session the sweep missed stops working too.
    """

    def user_can_authenticate(self, user):
        return super().user_can_authenticate(user) and admits_signing_in(user)
