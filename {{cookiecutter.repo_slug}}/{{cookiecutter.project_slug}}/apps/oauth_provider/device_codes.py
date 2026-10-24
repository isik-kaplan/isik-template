"""The device authorization grant (RFC 8628) hooks DOT is configured with."""

import secrets

from django.db import transaction
from oauthlib.oauth2.rfc6749 import errors


# RFC 8628 6.1: consonants only, so no code spells a word or is misread.
ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"
LENGTH = 8


def user_code():
    """OAUTH_DEVICE_USER_CODE_GENERATOR."""
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def as_stored(typed):
    return "".join(typed.split()).replace("-", "").upper()


def spend_device_code(request):
    """DOT's own mints a token every time, for any client; here a code buys its own client one token."""
    # Here: settings.py imports this module before any model can be.
    from oauth2_provider.models import get_device_grant_model

    DeviceGrant = get_device_grant_model()
    with transaction.atomic():
        grant = (
            DeviceGrant.objects.select_for_update()
            .filter(
                device_code=request._params.get("device_code"),
                client_id=request.client_id,
                status=DeviceGrant.AUTHORIZED,
            )
            .first()
        )
        if grant is None:
            raise errors.InvalidGrantError(request=request)
        DeviceGrant.objects.filter(pk=grant.pk).update(status=DeviceGrant.EXPIRED)
    request.user = grant.user
    request.scopes = grant.scope.split()
