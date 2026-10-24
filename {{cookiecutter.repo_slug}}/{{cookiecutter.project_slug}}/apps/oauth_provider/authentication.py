"""Only for the actions a view names in `token_actions`, so a new endpoint is closed by default."""

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
        # Otherwise every request without one goes through oauthlib.
        if not get_authorization_header(request).lower().startswith(b"bearer "):
            return None
        authenticated = super().authenticate(request)
        if authenticated is None:
            return None
        user, access_token = authenticated

        view = request.parser_context.get("view")
        if not takes_a_token(view):
            raise PermissionDenied(_("Applications cannot do this on anybody's behalf."))

        # Tokens carry what was approved when minted, so narrowing must reach them here.
        approved = set(access_token.application.approved_scopes.values_list("codename", flat=True))
        user.token_scopes = {
            scope for scope in access_token.scopes if scope in approved and scope in VOCABULARY.by_name
        }
        return user, access_token
