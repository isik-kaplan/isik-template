import pytest

from hooks._validate import (
    AnswersInvalid,
    parse_requested_providers,
    validate_answers,
    validate_domain,
    validate_provider_icons,
    validate_requested_providers,
    validate_required_fields,
)


def valid_answers(**overrides: str) -> dict:
    return {
        "project_name": "Test Project",
        "description": "A test project.",
        "author_name": "Jane Doe",
        "author_email": "jane@example.test",
        "domain": "example.test",
        "social_login_providers": "google",
        "social_login_provider_icons": "",
        **overrides,
    }


def test_accepts_a_fully_valid_set_of_answers():
    validate_answers(**valid_answers())  # does not raise


def test_validate_answers_rejects_an_unknown_provider_too():
    # Exercises the same check as test_rejects_an_unknown_provider, but through the top-level
    # entry point - proving requested_providers is actually parsed from the raw string and
    # forwarded, not silently dropped somewhere in between.
    with pytest.raises(AnswersInvalid, match="not-a-real-provider"):
        validate_answers(**valid_answers(social_login_providers="not-a-real-provider"))


def test_validate_answers_rejects_an_icon_for_an_unrequested_provider_too():
    # Same as test_rejects_an_icon_for_a_provider_not_requested, through the top-level entry
    # point - proving requested_providers reaches validate_provider_icons as the real parsed
    # list, not e.g. dropped to empty/None (which would silently skip this check).
    with pytest.raises(AnswersInvalid, match="not listed"):
        validate_answers(
            **valid_answers(
                social_login_providers="google", social_login_provider_icons="slack=https://example.test/slack.svg"
            )
        )


@pytest.mark.parametrize("field_name", ["project_name", "description", "author_name", "author_email", "domain"])
def test_rejects_a_blank_required_field(field_name):
    with pytest.raises(AnswersInvalid, match=field_name):
        validate_answers(**valid_answers(**{field_name: ""}))


@pytest.mark.parametrize("field_name", ["project_name", "description", "author_name", "author_email"])
def test_rejects_a_whitespace_only_required_field(field_name):
    with pytest.raises(AnswersInvalid, match=field_name):
        validate_required_fields(**{field_name: "   "})


def test_required_fields_accepts_non_blank_values():
    validate_required_fields(project_name="x", description="y")  # does not raise


@pytest.mark.parametrize("domain", ["localhost", "127.0.0.1", "0.0.0.0", "admin.localhost", "LOCALHOST"])
def test_rejects_localhost_style_domains(domain):
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_domain(domain)
    assert str(excinfo.value) == (
        f"'domain' ({domain!r}) can't be localhost or *.localhost - cross-subdomain session/CSRF "
        "cookies need a real registrable domain (Domain=.<domain>). Use a .test domain for local "
        "dev (e.g. myproject.test) and add it to /etc/hosts, or use your real deployment domain."
    )


def test_rejects_a_domain_with_no_dot():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_domain("no-dot-domain")
    assert str(excinfo.value) == (
        "'domain' ('no-dot-domain') needs at least one dot, e.g. myproject.test or myproject.com."
    )


def test_accepts_a_real_domain():
    validate_domain("example.test")  # does not raise


def test_parses_requested_providers_from_a_comma_separated_string():
    assert parse_requested_providers("google, github ,,openid_connect") == ["google", "github", "openid_connect"]


def test_parses_an_empty_provider_list():
    assert parse_requested_providers("") == []


def test_accepts_no_requested_providers():
    validate_requested_providers([])  # does not raise


def test_accepts_the_all_keyword():
    validate_requested_providers(["all"])  # does not raise


def test_accepts_known_providers():
    validate_requested_providers(["google", "github"])  # does not raise


def test_rejects_an_unknown_provider():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_providers(["google", "not-a-real-provider"])
    message = str(excinfo.value)
    assert message.startswith("Unknown social_login_providers: not-a-real-provider. Valid values: ")
    # The full, comma-separated KNOWN_PROVIDERS list is the rest of the message - checking two
    # arbitrary entries land with the real ", " separator (not run together) is enough without
    # hardcoding all ~100 of them here.
    assert "agave, amazon" in message
    assert message.endswith("or 'all' for every allauth-supported provider.")


def test_rejects_multiple_unknown_providers_joined_with_a_real_separator():
    # A single unknown provider above doesn't exercise the "unknown" list's own join separator -
    # nothing to join between one item.
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_providers(["not-a-real-provider", "also-not-real"])
    message = str(excinfo.value)
    assert message.startswith("Unknown social_login_providers: also-not-real, not-a-real-provider. Valid values:")


def test_accepts_no_icon_entries():
    validate_provider_icons("", ["google"])  # does not raise


def test_accepts_a_valid_icon_entry():
    validate_provider_icons("openid_connect=/icons/my-idp.svg", ["openid_connect"])  # does not raise


def test_accepts_multiple_valid_icon_entries_for_distinct_providers():
    validate_provider_icons(
        "google=https://a.test/g.svg,github=https://a.test/gh.svg", ["google", "github"]
    )  # does not raise


def test_rejects_an_icon_entry_missing_equals():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons("no-equals-sign", ["google"])
    assert str(excinfo.value) == (
        "'social_login_provider_icons' entry 'no-equals-sign' is missing '=' - each entry must be "
        "provider_id=url-or-path, e.g. openid_connect=/icons/my-idp.svg."
    )


def test_rejects_an_icon_entry_with_blank_provider_id():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons("=https://example.test/x.svg", ["google"])
    assert str(excinfo.value) == (
        "'social_login_provider_icons' entry '=https://example.test/x.svg' needs a provider id and "
        "a URL/path on both sides of '='."
    )


def test_rejects_an_icon_entry_with_blank_url():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons("google=", ["google"])
    assert str(excinfo.value) == (
        "'social_login_provider_icons' entry 'google=' needs a provider id and a URL/path on both "
        "sides of '='."
    )


def test_splits_an_icon_entry_on_the_first_equals_sign():
    # A URL can itself contain "=" (a query string) - splitting on the *last* one instead would
    # swallow it into the provider id, which then fails the KNOWN_PROVIDERS check below.
    validate_provider_icons("google=https://example.test/g.svg?query=1", ["google"])  # does not raise


def test_rejects_an_icon_for_an_unknown_provider():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons("not-a-real-provider=https://example.test/x.svg", ["not-a-real-provider"])
    assert str(excinfo.value) == "'social_login_provider_icons' names an unknown provider: 'not-a-real-provider'."


def test_rejects_the_same_provider_listed_twice_in_icons():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons("google=https://a.test/g.svg,google=https://b.test/g2.svg", ["google"])
    assert str(excinfo.value) == "'social_login_provider_icons' lists the same provider more than once: google."


def test_rejects_multiple_duplicated_providers_joined_with_a_real_separator():
    # A single duplicated provider above doesn't exercise the "duplicates" list's own join
    # separator - nothing to join between one item.
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons(
            "google=https://a.test/g.svg,google=https://b.test/g2.svg,"
            "github=https://a.test/gh.svg,github=https://b.test/gh2.svg",
            ["google", "github"],
        )
    assert str(excinfo.value) == "'social_login_provider_icons' lists the same provider more than once: github, google."


def test_rejects_an_icon_for_a_provider_not_requested():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons("slack=https://example.test/slack.svg", ["google"])
    assert str(excinfo.value) == (
        "'social_login_provider_icons' configures an icon for provider(s) not listed in "
        "'social_login_providers': slack."
    )


def test_rejects_multiple_unrequested_providers_joined_with_a_real_separator():
    # A single unrequested provider above doesn't exercise the "unrequested" list's own join
    # separator - nothing to join between one item.
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_provider_icons(
            "slack=https://example.test/slack.svg,discord=https://example.test/discord.svg", ["google"]
        )
    assert str(excinfo.value) == (
        "'social_login_provider_icons' configures an icon for provider(s) not listed in "
        "'social_login_providers': discord, slack."
    )


def test_accepts_an_icon_for_any_provider_when_all_are_requested():
    validate_provider_icons("slack=https://example.test/slack.svg", ["all"])  # does not raise


def test_accepts_an_icon_when_no_providers_were_requested_at_all():
    # An empty requested_providers list is falsy, so the "not listed in social_login_providers"
    # check - which only applies to a concrete list - never runs; nothing to be "not listed" in.
    validate_provider_icons("slack=https://example.test/slack.svg", [])  # does not raise
