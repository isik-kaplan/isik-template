from django.core.exceptions import ImproperlyConfigured


MODES = ("off", "internal", "public")


def oauth_provider_mode(mode: str, signing_key: str) -> str:
    """OAUTH_PROVIDER__MODE, read once by settings.py at startup: a mode this project has no behaviour for,
    or an issuer with nothing to sign its id_tokens with, stops startup rather than failing the first
    sign-in."""
    if mode not in MODES:
        raise ImproperlyConfigured(f"OAUTH_PROVIDER__MODE is {mode!r}, not one of {', '.join(MODES)}")
    if mode != "off" and not signing_key:
        raise ImproperlyConfigured(
            "OAUTH_PROVIDER__SIGNING_KEY is required unless OAUTH_PROVIDER__MODE is off - generate one with "
            "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048"
        )
    return mode
