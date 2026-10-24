from functools import wraps

from django.conf import settings
from django.http import Http404
from django.urls import URLPattern, path
from oauth2_provider import urls as oauth2_provider_urls

from apps.oauth_provider.views.authorization import AuthorizationView
from apps.oauth_provider.views.device_authorization import DeviceAuthorizationView


app_name = "oauth2_provider"

# An allowlist: DOT's other routes are flows not offered (dynamic client registration) or pages replaced.
SERVED = {
    "token",
    "revoke-token",
    "oidc-connect-discovery-info",
    "jwks-info",
    "user-info",
    "oauth-server-metadata",
}


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
