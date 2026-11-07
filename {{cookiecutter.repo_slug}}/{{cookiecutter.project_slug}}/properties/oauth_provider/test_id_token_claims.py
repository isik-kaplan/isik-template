from datetime import UTC, datetime

import pytest
from allauth.account.models import EmailAddress
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st

from apps.oauth_provider.validators import OAuth2Validator
from apps.users.models.user import User


pytestmark = pytest.mark.django_db

NAME = st.sampled_from(["", "Ada", "Lovelace"])
ADDRESS = st.sampled_from([None, "unverified", "verified"])
LOGGED_IN = st.none() | st.datetimes(
    min_value=datetime(2020, 1, 1), max_value=datetime(2030, 1, 1), timezones=st.just(UTC)
)


class _Request:
    def __init__(self, user):
        self.user = user


def expected(first, last, username, address, last_login):
    """The claims written out independently of the validator."""
    claims = {}
    if username:
        claims["preferred_username"] = username
    if first:
        claims["given_name"] = first
    if last:
        claims["family_name"] = last
    full = " ".join(part for part in (first, last) if part)
    if full:
        claims["name"] = full
    claims["email"] = "primary@example.test" if address else "account@example.test"
    claims["email_verified"] = address == "verified"
    if last_login:
        claims["auth_time"] = int(last_login.timestamp())
    return claims


@given(first=NAME, last=NAME, username=st.sampled_from([None, "ada"]), address=ADDRESS, last_login=LOGGED_IN)
def test_the_claims_say_exactly_what_the_account_holds(first, last, username, address, last_login):
    with transaction.atomic():
        person = User.objects.create_user(
            username=username, email="account@example.test", first_name=first, last_name=last
        )
        User.objects.filter(pk=person.pk).update(last_login=last_login)
        person.refresh_from_db()
        if address:
            EmailAddress.objects.create(
                user=person, email="primary@example.test", primary=True, verified=address == "verified"
            )

        claims = OAuth2Validator().get_additional_claims(_Request(person))

        transaction.set_rollback(True)
    assert claims == expected(first, last, username, address, last_login)
