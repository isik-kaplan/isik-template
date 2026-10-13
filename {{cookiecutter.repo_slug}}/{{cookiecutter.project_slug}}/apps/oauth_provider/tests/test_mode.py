import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.oauth_provider.mode import oauth_provider_mode


@pytest.mark.parametrize("mode", ["approval", "auto"])
def test_the_oauth_provider_starts_in_a_mode_it_has_a_key_for(mode):
    assert oauth_provider_mode(mode, "a key") == mode


def test_the_oauth_provider_needs_no_key_while_it_is_off():
    assert oauth_provider_mode("off", "") == "off"


@pytest.mark.parametrize("mode", ["", "on", "Auto", "public"])
def test_the_oauth_provider_refuses_to_start_in_a_mode_it_does_not_have(mode):
    with pytest.raises(ImproperlyConfigured) as error:
        oauth_provider_mode(mode, "a key")

    assert str(error.value) == f"OAUTH_PROVIDER__MODE is {mode!r}, not one of off, approval, auto"


@pytest.mark.parametrize("mode", ["approval", "auto"])
def test_the_oauth_provider_refuses_to_start_on_with_nothing_to_sign_with(mode):
    with pytest.raises(ImproperlyConfigured) as error:
        oauth_provider_mode(mode, "")

    assert str(error.value) == (
        "OAUTH_PROVIDER__SIGNING_KEY is required unless OAUTH_PROVIDER__MODE is off - generate one with "
        "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048"
    )
