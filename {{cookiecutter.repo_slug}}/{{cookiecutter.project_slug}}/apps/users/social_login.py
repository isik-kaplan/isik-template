import pkgutil

import allauth.socialaccount.providers as providers_package
from django.core.exceptions import ImproperlyConfigured


def social_login_provider_ids(requested: list[str]) -> list[str]:
    """Fails startup on an unknown or repeated provider, which would otherwise be a dead login button."""
    ids = [provider_id.strip() for provider_id in requested if provider_id.strip()]
    # base, oauth and oauth2 are shared bases, not providers.
    shipped = {name for _, name, _ in pkgutil.iter_modules(providers_package.__path__)} - {"base", "oauth", "oauth2"}
    unknown = sorted(set(ids) - shipped)
    if unknown:
        raise ImproperlyConfigured(f"SOCIAL_LOGIN__PROVIDERS names unknown providers: {', '.join(unknown)}")
    repeated = sorted({provider_id for provider_id in ids if ids.count(provider_id) > 1})
    if repeated:
        raise ImproperlyConfigured(f"SOCIAL_LOGIN__PROVIDERS names a provider more than once: {', '.join(repeated)}")
    return ids
