from django.conf import settings


class SuperusersOnlyWithoutPasswordsMixin:
    """With SOCIAL_LOGIN_ONLY a password signs in only a superuser, which the admin's sign-in page offers."""

    def authenticate(self, request, **credentials):
        user = super().authenticate(request, **credentials)
        if user is not None and settings.SOCIAL_LOGIN_ONLY and not user.is_superuser:
            return None
        return user
