import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.users.social_login import reauthentication_methods, social_login_only, social_login_provider_ids


def test_social_login_names_the_providers_it_was_given_in_order_without_blanks():
    requested = ["github", " google ", "", "openid_connect"]

    assert social_login_provider_ids(requested) == ["github", "google", "openid_connect"]


def test_social_login_is_off_when_no_provider_is_named():
    assert social_login_provider_ids([]) == []


@pytest.mark.parametrize("requested", [["google", "not_a_provider", "also_not"], ["oauth2"], ["base"], ["oauth"]])
def test_social_login_refuses_to_start_with_a_provider_allauth_does_not_ship(requested):
    unknown = ", ".join(sorted(set(requested) - {"google"}))

    with pytest.raises(ImproperlyConfigured) as error:
        social_login_provider_ids(requested)

    assert str(error.value) == f"SOCIAL_LOGIN__PROVIDERS names unknown providers: {unknown}"


def test_social_login_refuses_to_start_with_a_provider_named_twice():
    with pytest.raises(ImproperlyConfigured) as error:
        social_login_provider_ids(["google", "github", "google", " github", "apple"])

    assert str(error.value) == "SOCIAL_LOGIN__PROVIDERS names a provider more than once: github, google"


def test_signing_in_only_through_providers_refuses_to_start_with_none():
    with pytest.raises(ImproperlyConfigured) as error:
        social_login_only(True, [], debug=False)

    assert str(error.value) == "SOCIAL_LOGIN__ONLY needs at least one provider in SOCIAL_LOGIN__PROVIDERS"


@pytest.mark.parametrize(
    ("only", "provider_ids", "debug"),
    [(True, ["google"], False), (True, [], True), (False, [], False), (False, ["google"], True)],
)
def test_signing_in_only_through_providers_starts_with_one_or_in_development(only, provider_ids, debug):
    """In development a superuser still signs in to the admin, so a checkout runs before any provider is set up."""
    assert social_login_only(only, provider_ids, debug=debug) is only


def test_without_passwords_a_code_by_email_proves_it_in_the_passwords_place():
    assert reauthentication_methods(True) == ["code", "mfa"]
    assert reauthentication_methods(False) == ["password", "mfa"]
