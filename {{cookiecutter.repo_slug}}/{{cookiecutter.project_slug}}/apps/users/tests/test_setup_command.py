from io import StringIO

import pytest
from django.core.management import call_command

from apps.users.models.user import User
from {{ cookiecutter.project_slug }}.config import CONFIG as config


@pytest.mark.django_db
def test_setup_creates_a_superuser_when_none_exists():
    assert not User.objects.filter(is_superuser=True).exists()
    call_command("setup")
    assert User.objects.filter(is_superuser=True).exists()


@pytest.mark.django_db
def test_setup_creates_a_superuser_with_the_configured_credentials():
    call_command("setup")

    user = User.objects.get(is_superuser=True)
    assert user.username == config.SETUP.SUPERUSER.USERNAME
    assert user.email == config.SETUP.SUPERUSER.EMAIL
    assert user.check_password(config.SETUP.SUPERUSER.PASSWORD)


@pytest.mark.django_db
def test_setup_prints_a_success_message_naming_the_username():
    out = StringIO()
    call_command("setup", stdout=out)
    assert out.getvalue() == f"Created superuser '{config.SETUP.SUPERUSER.USERNAME}'.\n"


@pytest.mark.django_db
def test_setup_is_a_noop_when_a_superuser_already_exists():
    User.objects.create_superuser(username="existing", email="existing@example.test", password="x")
    call_command("setup")
    assert User.objects.filter(is_superuser=True).count() == 1


@pytest.mark.django_db
def test_setup_prints_a_skip_message_when_a_superuser_already_exists():
    User.objects.create_superuser(username="existing", email="existing@example.test", password="x")
    out = StringIO()
    call_command("setup", stdout=out)
    assert out.getvalue() == "A superuser already exists, skipping.\n"
