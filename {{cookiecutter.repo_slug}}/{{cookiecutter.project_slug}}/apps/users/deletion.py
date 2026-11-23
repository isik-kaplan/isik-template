"""What deleting an account does, by the name ACCOUNTS__DELETION gives it - isik's two backends."""

from django.core.exceptions import ImproperlyConfigured


DELETION_BACKENDS = {
    "erase": "isik.django.apps.accounts.backends.Erase",
    "anonymize": "isik.django.apps.accounts.backends.Anonymize",
}


def deletion_backend(name: str) -> str:
    """Fails startup on a name with no backend, which would otherwise surface only when a deletion is due."""
    try:
        return DELETION_BACKENDS[name]
    except KeyError:
        raise ImproperlyConfigured(
            f"ACCOUNTS__DELETION is {name!r}; it is one of {', '.join(DELETION_BACKENDS)}"
        ) from None
