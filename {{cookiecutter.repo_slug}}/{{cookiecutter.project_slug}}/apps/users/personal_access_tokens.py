"""Personal access tokens: made by somebody for themselves, for a script or a command line to call the API
as them. Not an application - nobody else is asked, and nothing signs in - so they are not OAuth's.

What one may do is the same as an application's token: only the actions a viewset names in
`token_actions`, and only within the scopes it was given and what its owner holds when it is used.
"""

import hashlib
import secrets

from django.db import transaction

from apps.users.models import PersonalAccessToken


# Fixed, so a token pasted somewhere it should not be is recognisable as one - by people, and by the secret
# scanners that look for prefixes - and so the authenticator can tell it from an application's at a glance.
PREFIX = "pat_"


def checksum(token):
    return hashlib.sha256(token.encode()).hexdigest()


@transaction.atomic
def make_token(*, user, scopes, **fields):
    """Returns the row, with the token itself as `issued_token` - readable here and nowhere else."""
    # 32 random bytes, secrets' own default and what it calls enough for a token.
    token = PREFIX + secrets.token_urlsafe()
    personal_access_token = PersonalAccessToken.objects.create(user=user, token_checksum=checksum(token), **fields)
    personal_access_token.scopes.set(scopes)
    personal_access_token.issued_token = token
    return personal_access_token
