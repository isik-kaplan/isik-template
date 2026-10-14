from functools import wraps

from django.conf import settings
from django.http import Http404
from django.urls import URLPattern, path
from oauth2_provider import urls as oauth2_provider_urls

from apps.oauth_provider.views.authorization import AuthorizationView
from apps.oauth_provider.views.device_authorization import DeviceAuthorizationView


app_name = "oauth2_provider"

# What this provider serves of DOT's, named rather than filtered: everything else is a flow it does not
# offer (dynamic client registration, which lets anybody register a client), a page the project replaces
# (DOT's application, token and device pages are unstyled templates, and its token delete left the
# refresh token alive) or introspection, which no resource server here needs.
SERVED = {
    "token",
    "revoke-token",
    "oidc-connect-discovery-info",
    "jwks-info",
    "user-info",
    "oauth-server-metadata",
}


def served_while_on(view):
    """404 while OAUTH_PROVIDER__MODE is off: no endpoint, discovery document or key to find. Decided
    per request rather than by leaving the routes out, so the mode never changes the routing itself."""

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
