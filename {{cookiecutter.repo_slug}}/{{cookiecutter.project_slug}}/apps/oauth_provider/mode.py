from django.core.exceptions import ImproperlyConfigured


MODES = ("off", "approval", "auto")


def oauth_provider_mode(mode: str, signing_key: str) -> str:
    """Fails startup rather than the first sign-in."""
    if mode not in MODES:
        raise ImproperlyConfigured(f"OAUTH_PROVIDER__MODE is {mode!r}, not one of {', '.join(MODES)}")
    if mode != "off" and not signing_key:
        raise ImproperlyConfigured(
            "OAUTH_PROVIDER__SIGNING_KEY is required unless OAUTH_PROVIDER__MODE is off - generate one with "
            "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048"
        )
    return mode
