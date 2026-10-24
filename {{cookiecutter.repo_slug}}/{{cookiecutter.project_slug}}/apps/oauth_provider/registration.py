from django.conf import settings


def may_register_applications(user):
    """No grant needed: an application reaches nobody until approved and consented to."""
    return settings.OAUTH_PROVIDER_MODE != "off" and user.is_authenticated


def approved_on_registration():
    return settings.OAUTH_PROVIDER_MODE == "auto"
