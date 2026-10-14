"""The device authorization grant (RFC 8628): a command line, or anything else with no browser of its own,
shows a code, and whoever enters it on the frontend's /device page lets it act for them.

DOT serves the two ends a device talks to - /o/device-authorization/ and /o/token/ - and these are what it
is configured with; the page in between is the API's (see DeviceAuthorizationViewSet).
"""

import secrets

from django.db import transaction
from oauthlib.oauth2.rfc6749 import errors


# RFC 8628 section 6.1's suggestion: consonants only, so no code spells a word and none is misread as
# another character - there is no 0 to take for an O, no 1 for an I. 20^8 codes, each alive ten minutes.
ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"
LENGTH = 8


def user_code():
    """OAUTH_DEVICE_USER_CODE_GENERATOR."""
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def as_stored(typed):
    """A code as somebody typed it - lower case, with the hyphen the device showed, or spaces - as stored."""
    return "".join(typed.split()).replace("-", "").upper()


def spend_device_code(request):
    """OAUTH_PRE_TOKEN_VALIDATION, in place of DOT's own, which mints a token for an authorized device code
    every time one is presented, to whichever client presents it. Here the code belongs to the client that
    asked for it, and buys one token: the device is told it expired if it asks again."""
    # Here rather than at the top: settings.py imports this module, before any model can be.
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
