"""allauth's headless routes without the v1/ allauth puts under each client; v0/ versions this API already."""

from allauth.headless import app_settings
from allauth.headless.constants import Client
from allauth.headless.urls import build_urlpatterns
from django.core.exceptions import ImproperlyConfigured
from django.urls import URLResolver, include, path

from apps.users.headless_spec import ALLAUTH_VERSION


app_name = "headless"

# allauth mounts these whatever the login methods; with no phone number on an account, its adapter raises.
NOT_SERVED = frozenset({"manage_phone", "verify_phone", "resend_phone_verification_code"})


def unversioned(client):
    built = build_urlpatterns(client)
    # Unwrapping anything but allauth's one v1/ would mount part of its API and lose the rest silently.
    if len(built) != 1 or str(built[0].pattern) != ALLAUTH_VERSION:
        raise ImproperlyConfigured(
            f"allauth's headless routes for {client.value} are no longer one {ALLAUTH_VERSION}: {built!r}"
        )
    return served(built[0].url_patterns)


def served(patterns):
    """`patterns` without the NOT_SERVED routes, at any depth."""
    kept = []
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            pattern = URLResolver(
                pattern.pattern,
                served(pattern.url_patterns),
                pattern.default_kwargs,
                pattern.app_name,
                pattern.namespace,
            )
        elif pattern.name in NOT_SERVED:
            continue
        kept.append(pattern)
    return kept


def headless_urlpatterns():
    """The tree allauth.headless.urls builds, namespaces and all, minus v1/."""
    patterns = [
        path(f"{client.value}/", include((unversioned(client), app_name), namespace=client.value))
        for client in (Client.BROWSER, Client.APP)
        if client in app_settings.CLIENTS
    ]
    if app_settings.SERVE_SPECIFICATION:
        patterns.append(path("", include("allauth.headless.spec.urls")))
    return patterns


urlpatterns = headless_urlpatterns()
