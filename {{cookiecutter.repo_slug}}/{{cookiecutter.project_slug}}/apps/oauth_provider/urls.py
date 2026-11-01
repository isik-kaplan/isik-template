from functools import wraps

from django.conf import settings
from django.http import Http404
from django.urls import URLPattern, path
from oauth2_provider import urls as oauth2_provider_urls

from apps.oauth_provider.views.authorization import AuthorizationView
from apps.oauth_provider.views.device_authorization import DeviceAuthorizationView


app_name = "oauth2_provider"

# An allowlist. Every route DOT ships is named in exactly one of these sets, or oauth_provider.E002/E003 fail startup,
# so a route a later release adds is a decision rather than something served by default.
SERVED = {
    "token",
    "revoke-token",
    "oidc-connect-discovery-info",
    "jwks-info",
    "user-info",
    "oauth-server-metadata",
}
# Served by this project's own views, below.
OVERRIDDEN = {"authorize", "device-authorization"}
NOT_SERVED = {
    # Application management and authorized tokens: the API's applications endpoints replace them.
    "list",
    "register",
    "detail",
    "update",
    "delete",
    "authorized-token-list",
    "authorized-token-delete",
    # Flows not offered.
    "dcr-register",
    "dcr-register-management",
    "introspect",
    "rp-initiated-logout",
    "oauth-resource-metadata",
    "oauth-resource-metadata-path",
    "oauth-server-metadata-issuer",
    # The device flow's pages are the frontend's.
    "device",
    "device-confirm",
    "device-grant-status",
}


def shipped_route_names():
    return {pattern.name for pattern in oauth2_provider_urls.urlpatterns}


def served_while_on(view):
    """404 while the provider is off, decided per request so the mode never changes the routing."""

    @wraps(view)
    def serve(request, *args, **kwargs):
        if settings.OAUTH_PROVIDER_MODE == "off":
            raise Http404
        return view(request, *args, **kwargs)

    return serve


def _served(pattern):
    # None of DOT's served routes carry default arguments.
    return URLPattern(pattern.pattern, served_while_on(pattern.callback), name=pattern.name)


urlpatterns = [
    path("authorize/", served_while_on(AuthorizationView.as_view()), name="authorize"),
    path(
        "device-authorization/",
        served_while_on(DeviceAuthorizationView.as_view()),
        name="device-authorization",
    ),
    *[_served(pattern) for pattern in oauth2_provider_urls.urlpatterns if pattern.name in SERVED],
]
