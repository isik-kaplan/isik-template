"""A personal access token calling the API."""

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from apps.common.api.token_actions import takes_a_token
from apps.users.login_policy import admits_session
from apps.users.models import PersonalAccessToken
from apps.users.permissions import VOCABULARY
from apps.users.personal_access_tokens import PREFIX, checksum


class PersonalAccessTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        # Any other bearer token is an application's, for the next authenticator.
        if len(parts) != 2 or parts[0].lower() != b"bearer" or not parts[1].startswith(PREFIX.encode()):
            return None
        token = (
            PersonalAccessToken.objects.unexpired()
            .select_related("user")
            .filter(token_checksum=checksum(parts[1].decode(errors="replace")))
            .first()
        )
        # One refusal for every reason, so a guessed token learns nothing.
        if token is None or not token.user.is_active or not admits_session(token.user):
            raise AuthenticationFailed(_("That token is unknown, expired or no longer allowed to sign in."))

        view = request.parser_context.get("view")
        if not takes_a_token(view):
            raise PermissionDenied(_("A token cannot do this on anybody's behalf."))

        PersonalAccessToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        user = token.user
        user.token_scopes = {
            scope for scope in token.scopes.values_list("codename", flat=True) if scope in VOCABULARY.by_name
        }
        return user, token
