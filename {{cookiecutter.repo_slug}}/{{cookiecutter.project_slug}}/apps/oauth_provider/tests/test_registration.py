import pytest
from django.contrib.auth.models import AnonymousUser

from apps.oauth_provider.registration import may_register_applications
from apps.users.models.user import User


@pytest.mark.parametrize(
    ("mode", "anybody", "somebody", "staff"),
    [("off", False, False, False), ("internal", False, False, True), ("public", False, True, True)],
)
def test_who_may_register_an_application_follows_the_mode(settings, mode, anybody, somebody, staff):
    settings.OAUTH_PROVIDER_MODE = mode

    assert may_register_applications(AnonymousUser()) is anybody
    assert may_register_applications(User(username="somebody")) is somebody
    assert may_register_applications(User(username="staff", is_staff=True)) is staff
