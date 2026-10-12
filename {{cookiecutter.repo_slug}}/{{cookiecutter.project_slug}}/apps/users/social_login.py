import pkgutil

import allauth.socialaccount.providers as providers_package
from django.core.exceptions import ImproperlyConfigured


def social_login_provider_ids(requested: list[str]) -> list[str]:
    """The allauth provider ids SOCIAL_LOGIN__PROVIDERS names, read once by settings.py at startup. A name
    allauth does not ship, or one named twice, stops startup: either would otherwise surface only as a
    login button that leads nowhere."""
    ids = [provider_id.strip() for provider_id in requested if provider_id.strip()]
    # Every provider is a package of its own; base, oauth and oauth2 are what they are built on.
    shipped = {name for _, name, _ in pkgutil.iter_modules(providers_package.__path__)} - {"base", "oauth", "oauth2"}
    unknown = sorted(set(ids) - shipped)
    if unknown:
        raise ImproperlyConfigured(f"SOCIAL_LOGIN__PROVIDERS names unknown providers: {', '.join(unknown)}")
    repeated = sorted({provider_id for provider_id in ids if ids.count(provider_id) > 1})
    if repeated:
        raise ImproperlyConfigured(f"SOCIAL_LOGIN__PROVIDERS names a provider more than once: {', '.join(repeated)}")
    return ids
