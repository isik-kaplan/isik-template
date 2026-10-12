from django.conf import settings


def may_register_applications(user):
    """Anybody signed in when the provider is public, staff when it is internal, nobody when it is off.
    Registering needs no grant beyond this: an application reaches nobody's account until they consent."""
    if settings.OAUTH_PROVIDER_MODE == "public":
        return user.is_authenticated
    return settings.OAUTH_PROVIDER_MODE == "internal" and user.is_staff
