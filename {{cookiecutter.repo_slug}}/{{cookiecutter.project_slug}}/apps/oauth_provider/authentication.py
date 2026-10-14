"""An application calling the API with a token somebody let it have.

Shut by default: a view takes these only for the actions it names in `token_actions`, so an
endpoint added later is closed to applications until somebody decides otherwise. And what the person
behind the token may do is narrowed to the scopes they let the application have - see PermissionsBackend.
"""

from django.conf import settings
from django.utils.translation import gettext_lazy as _
from oauth2_provider.contrib.rest_framework import OAuth2Authentication
from rest_framework.authentication import get_authorization_header
from rest_framework.exceptions import PermissionDenied

from apps.common.api.token_actions import takes_a_token
from apps.users.permissions import VOCABULARY


class ApplicationTokenAuthentication(OAuth2Authentication):
    def authenticate(self, request):
        if settings.OAUTH_PROVIDER_MODE == "off":
            return None
        # Read off the header first: every request without one would otherwise go through oauthlib.
        if not get_authorization_header(request).lower().startswith(b"bearer "):
            return None
        authenticated = super().authenticate(request)
        if authenticated is None:
            return None
        user, access_token = authenticated

        view = request.parser_context.get("view")
        if not takes_a_token(view):
            raise PermissionDenied(_("Applications cannot do this on anybody's behalf."))

        # Only what the application is still approved for: a superuser narrowing it reaches tokens already
        # handed out, which carry what was approved when they were minted.
        approved = set(access_token.application.approved_scopes.values_list("codename", flat=True))
        user.token_scopes = {
            scope for scope in access_token.scopes if scope in approved and scope in VOCABULARY.by_name
        }
        return user, access_token
