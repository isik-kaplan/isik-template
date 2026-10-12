import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.users.social_login import social_login_provider_ids


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
