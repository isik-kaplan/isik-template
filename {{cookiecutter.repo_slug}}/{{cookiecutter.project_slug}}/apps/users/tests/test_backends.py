import pytest
from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError

from apps.users.models.user import User
from apps.users.tests.conftest import PASSWORD


@pytest.mark.django_db
def test_an_email_signs_in_wherever_django_authenticates(alice):
    """The admin's login form passes whatever was typed as `username`."""
    assert authenticate(None, username=alice.email, password=PASSWORD) == alice


@pytest.mark.django_db
def test_a_username_that_is_somebody_elses_email_cannot_lock_them_out(alice):
    User.objects.create_user(username=alice.email, email="squatter@example.test", password="a-different-password")

    assert authenticate(None, username=alice.email, password=PASSWORD) == alice


@pytest.mark.django_db
def test_no_two_accounts_share_an_address(alice):
    """The identifier, so the database refuses it whoever writes: allauth's form check covers only signup."""
    with pytest.raises(ValidationError, match="already exists"):
        User.objects.create_user(username="twin", email=alice.email, password="a-different-password")
