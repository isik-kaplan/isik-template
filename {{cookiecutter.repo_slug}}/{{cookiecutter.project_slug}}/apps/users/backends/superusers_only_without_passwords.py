from django.conf import settings


class SuperusersOnlyWithoutPasswordsMixin:
    """With SOCIAL_LOGIN_ONLY a password signs in only a superuser, and only where it is still asked for: the
    admin's login form, since every headless password route is gone."""

    def authenticate(self, request, **credentials):
        user = super().authenticate(request, **credentials)
        if user is not None and settings.SOCIAL_LOGIN_ONLY and not user.is_superuser:
            return None
        return user
