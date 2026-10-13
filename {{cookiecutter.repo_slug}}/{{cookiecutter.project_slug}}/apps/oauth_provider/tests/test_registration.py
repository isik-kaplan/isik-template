import pytest
from django.contrib.auth.models import AnonymousUser

from apps.oauth_provider.registration import approved_on_registration, may_register_applications
from apps.users.models.user import User


@pytest.mark.parametrize(("mode", "somebody"), [("off", False), ("approval", True), ("auto", True)])
def test_anybody_signed_in_may_register_unless_the_provider_is_off(settings, mode, somebody):
    settings.OAUTH_PROVIDER_MODE = mode

    assert may_register_applications(AnonymousUser()) is False
    assert may_register_applications(User(username="somebody")) is somebody


@pytest.mark.parametrize(("mode", "approved"), [("off", False), ("approval", False), ("auto", True)])
def test_only_auto_approves_what_is_registered(settings, mode, approved):
    settings.OAUTH_PROVIDER_MODE = mode

    assert approved_on_registration() is approved
