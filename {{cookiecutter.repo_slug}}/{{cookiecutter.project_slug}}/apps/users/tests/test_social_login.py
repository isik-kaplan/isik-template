import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.users.social_login import (
    reauthentication_methods,
    social_account_providers,
    social_app,
    social_login_only,
    social_login_provider_ids,
)


PREFIX = "P__OAUTH"


def test_social_login_names_the_providers_it_was_given_in_order_without_blanks():
    requested = ["github", " google ", "", "openid_connect:corp"]

    assert social_login_provider_ids(requested) == ["github", "google", "openid_connect:corp"]


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


def test_several_openid_connect_issuers_sit_side_by_side():
    requested = ["openid_connect:corp", "openid_connect:customers-eu", "openid_connect:a_b"]

    assert social_login_provider_ids(requested) == requested


@pytest.mark.parametrize(
    "unnamed", ["openid_connect", "openid_connect:", "openid_connect:Corp", "openid_connect:1st", "google:corp"]
)
def test_an_issuer_must_be_named_and_nothing_else_may_be(unnamed):
    with pytest.raises(ImproperlyConfigured) as error:
        social_login_provider_ids(["github", unnamed])

    assert str(error.value) == (
        "SOCIAL_LOGIN__PROVIDERS needs each OpenID Connect issuer as openid_connect:<issuer>, a-z first, "
        f"and nothing else with a colon: {unnamed}"
    )


def test_every_unnamed_issuer_is_named_at_once():
    with pytest.raises(ImproperlyConfigured, match=r"with a colon: github:corp, openid_connect$"):
        social_login_provider_ids(["openid_connect", "github:corp"])


def test_an_unknown_provider_is_named_without_its_issuer():
    with pytest.raises(ImproperlyConfigured, match="unknown providers: nope$"):
        social_login_provider_ids(["nope:corp"])


def test_an_issuer_named_twice_is_refused():
    with pytest.raises(ImproperlyConfigured, match="more than once: openid_connect:corp$"):
        social_login_provider_ids(["openid_connect:corp", "openid_connect:corp"])


def test_a_providers_app_reads_its_credentials_from_its_own_variables():
    environ = {f"{PREFIX}__GOOGLE__CLIENT_ID": "an-id", f"{PREFIX}__GOOGLE__CLIENT_SECRET": "a-secret"}

    assert social_app("google", environ, PREFIX) == {"client_id": "an-id", "secret": "a-secret", "key": ""}
    assert social_app("github", {}, PREFIX) == {"client_id": "", "secret": "", "key": ""}


def test_an_issuers_app_reads_its_own_variables_and_is_called_by_its_name():
    environ = {
        f"{PREFIX}__CUSTOMERS_EU__CLIENT_ID": "an-id",
        f"{PREFIX}__CUSTOMERS_EU__SERVER_URL": "https://idp.example.test",
        f"{PREFIX}__CUSTOMERS_EU__NAME": "Customer login",
    }

    assert social_app("openid_connect:customers-eu", environ, PREFIX) == {
        "client_id": "an-id",
        "secret": "",
        "key": "",
        "provider_id": "customers-eu",
        "name": "Customer login",
        "settings": {"server_url": "https://idp.example.test"},
    }


def test_an_issuer_without_a_name_of_its_own_is_called_as_its_button_is():
    app = social_app("openid_connect:corp", {}, PREFIX)

    assert (app["name"], app["settings"]) == ("Corp", {"server_url": ""})
    assert social_app("openid_connect:customer-login_eu", {}, PREFIX)["name"] == "Customer Login Eu"


def test_issuers_are_one_providers_apps_and_every_other_provider_has_its_own():
    environ = {f"{PREFIX}__GITHUB__CLIENT_ID": "gh", f"{PREFIX}__CORP__CLIENT_ID": "corp-id"}

    providers = social_account_providers(["github", "openid_connect:corp", "openid_connect:customers"], environ, PREFIX)

    assert list(providers) == ["github", "openid_connect"]
    assert [app["provider_id"] for app in providers["openid_connect"]["APPS"]] == ["corp", "customers"]
    assert providers["openid_connect"]["APPS"][0]["client_id"] == "corp-id"
    assert providers["github"] == {"APPS": [{"client_id": "gh", "secret": "", "key": ""}]}


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
