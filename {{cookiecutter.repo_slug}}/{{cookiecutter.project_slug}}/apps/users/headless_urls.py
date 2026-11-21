"""allauth's headless routes without the v1/ allauth puts under each client; v0/ versions this API already."""

import copy
import functools

from allauth.headless import app_settings
from allauth.headless.constants import Client
from allauth.headless.urls import build_urlpatterns
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.urls import URLResolver, include, path

from apps.users.headless_spec import ALLAUTH_VERSION


app_name = "headless"
{%- if cookiecutter.phone == "none" %}

# allauth mounts these whatever the login methods; with no phone number on an account, its adapter raises.
PHONE_ROUTES = frozenset({"manage_phone", "verify_phone", "resend_phone_verification_code"})
{%- endif %}

# Everything a password is typed or set through; with SOCIAL_LOGIN_ONLY each is not found.
PASSWORD_ROUTES = frozenset(
    {"login", "signup", "reauthenticate", "request_password_reset", "reset_password", "change_password"}
)


def with_passwords_only(view):
    """Asked per request rather than left unmounted, so the setting holds wherever it is read. None of the
    PASSWORD_ROUTES captures anything from its path, so the request is all a view is called with."""

    @functools.wraps(view)
    def answer(request):
        if settings.SOCIAL_LOGIN_ONLY:
            raise Http404
        return view(request)

    # So a gated replacement (apps.users.reauthentication.routing) keeps the setting too.
    answer.needs_passwords = True
    return answer


def unversioned(client):
    built = build_urlpatterns(client)
    # Unwrapping anything but allauth's one v1/ would mount part of its API and lose the rest silently.
    if len(built) != 1 or str(built[0].pattern) != ALLAUTH_VERSION:
        raise ImproperlyConfigured(
            f"allauth's headless routes for {client.value} are no longer one {ALLAUTH_VERSION}: {built!r}"
        )
    return served(built[0].url_patterns)


def served(patterns):
{%- if cookiecutter.phone == "none" %}
    """`patterns` without the PHONE_ROUTES and with the PASSWORD_ROUTES behind the setting, at any depth."""
{%- else %}
    """`patterns` with the PASSWORD_ROUTES behind the setting, at any depth."""
{%- endif %}
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
{%- if cookiecutter.phone == "none" %}
        elif pattern.name in PHONE_ROUTES:
            continue
{%- endif %}
        elif pattern.name in PASSWORD_ROUTES:
            pattern = copy.copy(pattern)
            pattern.callback = with_passwords_only(pattern.callback)
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
