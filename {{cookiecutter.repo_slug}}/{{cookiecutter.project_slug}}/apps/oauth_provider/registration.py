from django.conf import settings


def may_register_applications(user):
    """Anybody signed in, unless the provider is off. Registering needs no grant beyond that: an
    application reaches nobody's account until it is approved and they consent."""
    return settings.OAUTH_PROVIDER_MODE != "off" and user.is_authenticated


def approved_on_registration():
    """In auto mode nothing waits for a superuser; in approval mode everything does."""
    return settings.OAUTH_PROVIDER_MODE == "auto"
