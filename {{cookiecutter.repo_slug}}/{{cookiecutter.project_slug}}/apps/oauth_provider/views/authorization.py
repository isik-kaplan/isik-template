import json
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import logout
from django.http import HttpResponseRedirect
from oauth2_provider.views import AuthorizationView as _AuthorizationView


# What DOT's own consent form posts back besides `scope`, so the frontend's page can echo each unchanged.
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
    """DOT's consent screen is an unstyled Django template; this sends the browser to the frontend's
    page instead, which posts its answer straight back here to DOT's own, unchanged POST handling."""

    # A FormView answers PUT as a second POST; nothing sends one.
    http_method_names = ["get", "post", "head", "options"]

    def get(self, request, *args, **kwargs):
        """`prompt=login` ends the session first, so going on means signing in again for real.

        `auth_time` says when they were last challenged and reads `last_login`, which only a real sign-in
        moves - re-authenticating records the proof on the session and leaves it alone, so an
        application asking for a fresh sign-in would otherwise be told one happened when none did.
        """
        if "login" in request.GET.get("prompt", "").split() and request.user.is_authenticated:
            logout(request)
            return HttpResponseRedirect(request.get_full_path())
        return super().get(request, *args, **kwargs)

    def render_to_response(self, context, **response_kwargs):
        # DOT renders its error page through here too, for a request it cannot send back to any application -
        # an unknown or unapproved client, a redirect URI it never registered - and there is no application to
        # name then.
        if "error" in context:
            error = urlencode({"error": context["error"].error})
            return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/auth/oauth/error?{error}")
        application = context["application"]
        params = {
            "application_name": application.name,
            "application_description": application.description,
            "scope": " ".join(context["scopes"]),
            # In request order, worded by the scopes backend: the page words the sign-in scopes itself, in the
            # reader's language, and has only these for the permissions an application may act with.
            "scopes_descriptions": json.dumps(context["scopes_descriptions"]),
        }
        for field in CONSENT_FIELDS:
            value = context.get(field)
            # DOT json-dumps an absent `claims` into the string "null".
            if value and value != "null":
                params[field] = value
        return HttpResponseRedirect(f"{settings.FRONTEND_ORIGIN}/auth/oauth/authorize?{urlencode(params)}")
