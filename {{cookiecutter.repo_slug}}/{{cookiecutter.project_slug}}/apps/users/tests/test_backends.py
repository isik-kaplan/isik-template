import pytest
from django.contrib.auth import authenticate

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
def test_two_accounts_sharing_an_email_do_not_break_signing_in(alice):
    User.objects.create_user(username="twin", email=alice.email, password="a-different-password")

    assert authenticate(None, username=alice.email, password=PASSWORD) == alice
