from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from allauth.account.models import EmailAddress

from apps.oauth_provider.validators import OAuth2Validator
from apps.users.models.user import User


def _claims(user):
    return OAuth2Validator().get_additional_claims(SimpleNamespace(user=user))


@pytest.mark.django_db
def test_everything_known_about_somebody_is_said():
    user = User.objects.create_user(username="ada", email="old@example.test", first_name="Ada", last_name="Lovelace")
    user.last_login = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    EmailAddress.objects.create(user=user, email="ada@example.test", verified=True, primary=True)

    assert _claims(user) == {
        "preferred_username": "ada",
        "given_name": "Ada",
        "family_name": "Lovelace",
        "name": "Ada Lovelace",
        "email": "ada@example.test",
        "email_verified": True,
        "auth_time": 1767323045,
    }


@pytest.mark.django_db
def test_what_is_not_known_is_left_out_rather_than_said_empty():
    user = User.objects.create_user(username="nobody", email="")

    assert _claims(user) == {"preferred_username": "nobody"}


@pytest.mark.django_db
def test_an_address_allauth_never_verified_says_so():
    user = User.objects.create_user(username="made-by-hand", email="admin@example.test")
    EmailAddress.objects.create(user=user, email="other@example.test", verified=True, primary=False)
    somebody_else = User.objects.create_user(username="somebody-else")
    EmailAddress.objects.create(user=somebody_else, email="else@example.test", verified=True, primary=True)

    assert _claims(user) == {
        "preferred_username": "made-by-hand",
        "email": "admin@example.test",
        "email_verified": False,
    }


@pytest.mark.django_db
def test_an_unverified_primary_address_is_said_unverified():
    user = User.objects.create_user(username="pending", email="pending@example.test")
    EmailAddress.objects.create(user=user, email="pending@example.test", verified=False, primary=True)

    assert _claims(user)["email_verified"] is False


@pytest.mark.django_db
def test_a_first_name_alone_is_the_whole_name():
    user = User.objects.create_user(username="cher", first_name="Cher")

    assert _claims(user) == {"preferred_username": "cher", "given_name": "Cher", "name": "Cher"}
