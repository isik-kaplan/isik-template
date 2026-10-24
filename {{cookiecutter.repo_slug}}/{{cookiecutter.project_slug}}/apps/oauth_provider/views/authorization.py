import json
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import logout
from django.http import HttpResponseRedirect
from oauth2_provider.views import AuthorizationView as _AuthorizationView


# What DOT's consent form posts back besides `scope`, for the frontend to echo unchanged.
CONSENT_FIELDS = (
    "client_id",
    "redirect_uri",
    "response_type",
    "state",
    "nonce",
    "code_challenge",
    "code_challenge_method",
    "claims",
    "resource",
)


class AuthorizationView(_AuthorizationView):
    """Sends the browser to the frontend's consent page, which posts back to DOT's unchanged handling."""

    # A FormView answers PUT as a second POST.
    http_method_names = ["get", "post", "head", "options"]

    def get(self, request, *args, **kwargs):
        """`prompt=login` ends the session: `auth_time` reads `last_login`, which re-authenticating leaves
        alone, so only a real sign-in satisfies it."""
        if "login" in request.GET.get("prompt", "").split() and request.user.is_authenticated:
            logout(request)
            return HttpResponseRedirect(request.get_full_path())
        return super().get(request, *args, **kwargs)

    def render_to_response(self, context, **response_kwargs):
        # DOT renders its error page through here too, with no application to name.
        if "error" in context:
            error = urlencode({"error": context["error"].error})
            return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/auth/oauth/error?{error}")
        application = context["application"]
        params = {
            "application_name": application.name,
            "application_description": application.description,
            "scope": " ".join(context["scopes"]),
            # The page words the sign-in scopes itself; these are for the permissions.
            "scopes_descriptions": json.dumps(context["scopes_descriptions"]),
        }
        for field in CONSENT_FIELDS:
            value = context.get(field)
            # DOT json-dumps an absent `claims` into the string "null".
            if value and value != "null":
                params[field] = value
        return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/auth/oauth/authorize?{urlencode(params)}")
