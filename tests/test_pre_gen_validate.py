import pytest

from hooks._validate import (
    KNOWN_LANGUAGES,
    AnswersInvalid,
    parse_requested_languages,
    parse_requested_providers,
    validate_answers,
    validate_domain,
    validate_free_text,
    validate_provider_icons,
    validate_requested_languages,
    validate_requested_providers,
    validate_required_fields,
    validate_slugs,
)


def valid_answers(**overrides: str) -> dict:
    return {
        "project_name": "Test Project",
        "project_slug": "test_project",
        "repo_slug": "test-project",
        "description": "A test project.",
        "author_name": "Jane Doe",
        "author_email": "jane@example.test",
        "domain": "example.test",
        "social_login_providers": "google",
        "social_login_provider_icons": "",
        "languages": "en",
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
    validate_domain("my-app2.example.test")  # does not raise


@pytest.mark.parametrize("domain", ['ex"ample.test', "example.test/path", "exa mple.test", "example_x.test"])
def test_rejects_a_domain_with_characters_a_hostname_cannot_have(domain):
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_domain(domain)
    assert str(excinfo.value) == f"'domain' ({domain!r}) can only contain letters, digits, '.' and '-'."


def test_accepts_an_uppercase_domain_as_its_lowercase_form():
    validate_domain("Example.TEST")  # does not raise


@pytest.mark.parametrize(
    ("slug_name", "value"),
    [("project_slug", "a"), ("project_slug", "my_app_2"), ("repo_slug", "a"), ("repo_slug", "my-app-2")],
)
def test_accepts_valid_slugs(slug_name, value):
    validate_slugs(**{slug_name: value})  # does not raise


@pytest.mark.parametrize(
    ("slug_name", "value", "pattern"),
    [
        ("project_slug", "my_app_(v2)", "[a-z][a-z0-9_]*"),
        ("project_slug", "my-app", "[a-z][a-z0-9_]*"),
        ("project_slug", "2app", "[a-z][a-z0-9_]*"),
        ("project_slug", "My_app", "[a-z][a-z0-9_]*"),
        ("project_slug", "", "[a-z][a-z0-9_]*"),
        ("project_slug", "app\n", "[a-z][a-z0-9_]*"),
        ("repo_slug", "my-app-(v2)", "[a-z][a-z0-9-]*"),
        ("repo_slug", "my_app", "[a-z][a-z0-9-]*"),
        ("repo_slug", "-app", "[a-z][a-z0-9-]*"),
        ("repo_slug", "app\n", "[a-z][a-z0-9-]*"),
    ],
)
def test_rejects_invalid_slugs(slug_name, value, pattern):
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_slugs(**{slug_name: value})
    assert str(excinfo.value) == (
        f"'{slug_name}' ({value!r}) must match {pattern} - pick a project_name made of letters, digits, "
        f"spaces, '-' and '_', or answer '{slug_name}' directly."
    )


@pytest.mark.parametrize(
    ("field_name", "value"),
    [("project_name", "My App-2_x"), ("description", "A team's $5 app"), ("author_email", "o'brien@example.test")],
)
def test_accepts_free_text_without_forbidden_characters(field_name, value):
    validate_free_text(**{field_name: value})  # does not raise


@pytest.mark.parametrize(
    ("field_name", "value", "listed"),
    [
        ("project_name", 'A "quoted" app', '"'),
        ("project_name", "back\\slash", "\\"),
        ("project_name", "Bob's app", "'"),
        ("project_name", "run `this`", "`"),
        ("project_name", "cash $app", "$"),
        ("project_name", "all \" \\ ' ` $", "\" $ ' \\ `"),
        ("description", 'A "simple" app', '"'),
        ("description", "back\\slash", "\\"),
        ("author_email", 'a"b@example.test', '"'),
        ("author_email", "a\\b@example.test", "\\"),
    ],
)
def test_rejects_free_text_with_forbidden_characters(field_name, value, listed):
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_free_text(**{field_name: value})
    assert str(excinfo.value) == f"'{field_name}' ({value!r}) can't contain {listed}."


@pytest.mark.parametrize(
    ("override", "match"),
    [
        ({"project_slug": "my_app_(v2)"}, "'project_slug'"),
        ({"repo_slug": "my-app-(v2)"}, "'repo_slug'"),
        ({"project_name": 'A "quoted" app'}, "'project_name'"),
        ({"description": 'A "simple" app'}, "'description'"),
        ({"author_email": 'a"b@example.test'}, "'author_email'"),
    ],
)
def test_validate_answers_checks_slugs_and_free_text_too(override, match):
    with pytest.raises(AnswersInvalid, match=match):
        validate_answers(**valid_answers(**override))


def test_author_name_may_carry_any_character():
    # It only lands in tojson-escaped hook literals, the LICENSE and .po comments.
    validate_answers(**valid_answers(author_name='O\'Brien "Q" \\ `x` $y'))  # does not raise


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
        "'social_login_provider_icons' entry 'google=' needs a provider id and a URL/path on both sides of '='."
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


def test_validate_answers_rejects_an_unknown_language_too():
    # Exercises the same check as test_rejects_an_unknown_language, through the top-level entry
    # point - proving languages is actually parsed from the raw string and forwarded.
    with pytest.raises(AnswersInvalid, match="Unknown languages"):
        validate_answers(**valid_answers(languages="en,not-a-real-language"))


def test_validate_answers_accepts_the_default_english_only_languages():
    # Left out rather than passed, so it is the parameter's own default being accepted.
    answers = valid_answers()
    del answers["languages"]
    validate_answers(**answers)  # does not raise


def test_parses_requested_languages_from_a_comma_separated_string():
    assert parse_requested_languages("en, tr ,,fr") == ["en", "tr", "fr"]


def test_rejects_an_empty_language_list():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_languages(parse_requested_languages(""))
    assert str(excinfo.value) == "'languages' must list at least one language code, e.g. 'en' or 'en,tr'."


def test_accepts_english_only():
    validate_requested_languages(["en"])  # does not raise


def test_accepts_english_plus_other_known_languages():
    validate_requested_languages(["en", "tr", "fr"])  # does not raise


def test_rejects_languages_not_starting_with_english():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_languages(["tr", "en"])
    assert str(excinfo.value) == (
        "'languages' (tr, en) must start with 'en' - every string in this template is authored in "
        "English first; other languages are translated from it, never instead of it."
    )


def test_rejects_a_language_list_missing_english_entirely():
    with pytest.raises(AnswersInvalid, match="must start with 'en'"):
        validate_requested_languages(["tr"])


def test_rejects_an_unknown_language():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_languages(["en", "not-a-real-language"])
    assert str(excinfo.value) == (
        f"Unknown languages: not-a-real-language. Valid values: {', '.join(sorted(KNOWN_LANGUAGES))}."
    )


def test_rejects_multiple_unknown_languages_joined_with_a_real_separator():
    # A single unknown language above doesn't exercise the "unknown" list's own join separator -
    # nothing to join between one item.
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_languages(["en", "not-real", "also-not-real"])
    message = str(excinfo.value)
    assert message.startswith("Unknown languages: also-not-real, not-real. Valid values:")


def test_rejects_a_duplicated_language():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_languages(["en", "tr", "tr"])
    assert str(excinfo.value) == "'languages' lists the same language more than once: tr."


def test_rejects_multiple_duplicated_languages_joined_with_a_real_separator():
    with pytest.raises(AnswersInvalid) as excinfo:
        validate_requested_languages(["en", "tr", "tr", "fr", "fr"])
    assert str(excinfo.value) == "'languages' lists the same language more than once: fr, tr."
