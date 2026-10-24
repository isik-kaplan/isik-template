"""Personal access tokens: not OAuth, since no application is involved, but limited like one."""

import hashlib
import secrets

from django.db import transaction

from apps.users.models import PersonalAccessToken


# Recognisable to secret scanners, and tells it from an application's token.
PREFIX = "pat_"


def checksum(token):
    return hashlib.sha256(token.encode()).hexdigest()


@transaction.atomic
def make_token(*, user, scopes, **fields):
    """The token itself is on `issued_token`, and nowhere else."""
    token = PREFIX + secrets.token_urlsafe()
    personal_access_token = PersonalAccessToken.objects.create(user=user, token_checksum=checksum(token), **fields)
    personal_access_token.scopes.set(scopes)
    personal_access_token.issued_token = token
    return personal_access_token
