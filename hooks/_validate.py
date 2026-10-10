"""The actual validation logic behind pre_gen_project.py's hook script.

Kept in its own plain (non-templated) module, importable and unit-testable directly - the hook
script itself is a Jinja template (cookiecutter renders it, then runs it as a subprocess), which
neither pytest nor mutmut's coverage tracking can see into.
"""

import re


class AnswersInvalid(ValueError):
    """Raised with the exact message the hook should print and exit 1 over."""


REQUIRED_FIELDS = ("project_name", "description", "author_name", "author_email", "domain")

# The slugs name the Python package, the Docker services and the npm workspace, none of which take
# spaces, punctuation or a leading digit.
SLUG_PATTERNS = {"project_slug": r"[a-z][a-z0-9_]*", "repo_slug": r"[a-z][a-z0-9-]*"}

# Characters each free-text answer can't carry: hooks, settings and pyproject escape answers with
# tojson, but the same answers also land unescaped in TS literals, shell strings, .env and .po files.
FORBIDDEN_CHARACTERS = {
    # project_name also sits inside single-quoted TS strings and a double-quoted shell echo.
    "project_name": "\"\\'`$",
    "description": '"\\',
    "author_email": '"\\',
}

DOMAIN_PATTERN = r"[a-z0-9.-]+"

# allauth.socialaccount.providers/* provider ids, minus non-provider dirs (base, oauth, oauth2)
# and internal subdirs (__pycache__, static, templates, data, migrations). Keep in sync with the
# expansion list in the generated project's settings.py (see Phase 4) if this ever changes.
KNOWN_PROVIDERS = {
    "agave",
    "amazon",
    "amazon_cognito",
    "apple",
    "asana",
    "atlassian",
    "auth0",
    "authentiq",
    "baidu",
    "basecamp",
    "battlenet",
    "bitbucket_oauth2",
    "bitly",
    "box",
    "cilogon",
    "clever",
    "coinbase",
    "dataporten",
    "daum",
    "digitalocean",
    "dingtalk",
    "discogs",
    "discord",
    "disqus",
    "douban",
    "doximity",
    "draugiem",
    "drip",
    "dropbox",
    "dummy",
    "dwolla",
    "edmodo",
    "edx",
    "eventbrite",
    "eveonline",
    "evernote",
    "exist",
    "facebook",
    "feedly",
    "figma",
    "fivehundredpx",
    "flickr",
    "foursquare",
    "frontier",
    "fxa",
    "gitea",
    "github",
    "gitlab",
    "globus",
    "google",
    "gumroad",
    "hubic",
    "hubspot",
    "instagram",
    "jupyterhub",
    "kakao",
    "klaviyo",
    "lemonldap",
    "lichess",
    "line",
    "linkedin_oauth2",
    "mailchimp",
    "mailcow",
    "mailru",
    "mediawiki",
    "meetup",
    "microsoft",
    "miro",
    "naver",
    "netiq",
    "nextcloud",
    "notion",
    "okta",
    "openid",
    "openid_connect",
    "openstreetmap",
    "orcid",
    "patreon",
    "paypal",
    "pinterest",
    "pocket",
    "questrade",
    "quickbooks",
    "reddit",
    "robinhood",
    "salesforce",
    "saml",
    "sharefile",
    "shopify",
    "slack",
    "snapchat",
    "soundcloud",
    "spotify",
    "stackexchange",
    "steam",
    "stocktwits",
    "strava",
    "stripe",
    "telegram",
    "tiktok",
    "trainingpeaks",
    "trello",
    "tumblr",
    "tumblr_oauth2",
    "twentythreeandme",
    "twitch",
    "twitter",
    "twitter_oauth2",
    "untappd",
    "vimeo",
    "vimeo_oauth2",
    "vk",
    "wahoo",
    "weibo",
    "weixin",
    "windowslive",
    "xing",
    "yahoo",
    "yandex",
    "ynab",
    "zoho",
    "zoom",
}

# django.conf.locale.LANG_INFO keys (Django 5.2) - the generated project's own settings.py builds
# its LANGUAGES display names from that same dict, but this hook's environment has no Django
# installed to import it from, so the codes are mirrored here instead, same as KNOWN_PROVIDERS above.
KNOWN_LANGUAGES = {
    "af",
    "ar",
    "ar-dz",
    "ast",
    "az",
    "be",
    "bg",
    "bn",
    "br",
    "bs",
    "ca",
    "ckb",
    "cs",
    "cy",
    "da",
    "de",
    "dsb",
    "el",
    "en",
    "en-au",
    "en-gb",
    "eo",
    "es",
    "es-ar",
    "es-co",
    "es-mx",
    "es-ni",
    "es-ve",
    "et",
    "eu",
    "fa",
    "fi",
    "fr",
    "fy",
    "ga",
    "gd",
    "gl",
    "he",
    "hi",
    "hr",
    "hsb",
    "ht",
    "hu",
    "hy",
    "ia",
    "id",
    "ig",
    "io",
    "is",
    "it",
    "ja",
    "ka",
    "kab",
    "kk",
    "km",
    "kn",
    "ko",
    "ky",
    "lb",
    "lt",
    "lv",
    "mk",
    "ml",
    "mn",
    "mr",
    "ms",
    "my",
    "nb",
    "ne",
    "nl",
    "nn",
    "no",
    "os",
    "pa",
    "pl",
    "pt",
    "pt-br",
    "ro",
    "ru",
    "sk",
    "sl",
    "sq",
    "sr",
    "sr-latn",
    "sv",
    "sw",
    "ta",
    "te",
    "tg",
    "th",
    "tk",
    "tr",
    "tt",
    "udm",
    "ug",
    "uk",
    "ur",
    "uz",
    "vi",
    "zh-cn",
    "zh-hans",
    "zh-hant",
    "zh-hk",
    "zh-mo",
    "zh-my",
    "zh-sg",
    "zh-tw",
}


def validate_required_fields(**fields: str) -> None:
    for field_name, value in fields.items():
        if not value.strip():
            raise AnswersInvalid(
                f"'{field_name}' is required and has no default - re-run cookiecutter and provide a real value."
            )


def validate_slugs(**slugs: str) -> None:
    for slug_name, value in slugs.items():
        pattern = SLUG_PATTERNS[slug_name]
        if not re.fullmatch(pattern, value):
            raise AnswersInvalid(
                f"'{slug_name}' ({value!r}) must match {pattern} - pick a project_name made of letters, digits, "
                f"spaces, '-' and '_', or answer '{slug_name}' directly."
            )


def validate_free_text(**fields: str) -> None:
    for field_name, value in fields.items():
        forbidden = sorted(set(FORBIDDEN_CHARACTERS[field_name]) & set(value))
        if forbidden:
            raise AnswersInvalid(f"'{field_name}' ({value!r}) can't contain {' '.join(forbidden)}.")


def validate_domain(domain: str) -> None:
    normalized = domain.strip().lower()
    if normalized in {"localhost", "127.0.0.1", "0.0.0.0"} or normalized.endswith(".localhost"):
        raise AnswersInvalid(
            f"'domain' ({domain!r}) can't be localhost or *.localhost - cross-subdomain session/CSRF "
            "cookies need a real registrable domain (Domain=.<domain>). Use a .test domain for local "
            "dev (e.g. myproject.test) and add it to /etc/hosts, or use your real deployment domain."
        )
    if "." not in normalized:
        raise AnswersInvalid(f"'domain' ({domain!r}) needs at least one dot, e.g. myproject.test or myproject.com.")
    if not re.fullmatch(DOMAIN_PATTERN, normalized):
        raise AnswersInvalid(f"'domain' ({domain!r}) can only contain letters, digits, '.' and '-'.")


def parse_requested_providers(social_login_providers: str) -> list[str]:
    return [p.strip() for p in social_login_providers.split(",") if p.strip()]


def validate_requested_providers(requested_providers: list[str]) -> None:
    if not requested_providers or requested_providers == ["all"]:
        return
    unknown = sorted(set(requested_providers) - KNOWN_PROVIDERS)
    if unknown:
        raise AnswersInvalid(
            f"Unknown social_login_providers: {', '.join(unknown)}. Valid values: "
            f"{', '.join(sorted(KNOWN_PROVIDERS))}, or 'all' for every allauth-supported provider."
        )


def validate_provider_icons(social_login_provider_icons: str, requested_providers: list[str]) -> None:
    # provider_id=url-or-path pairs, e.g. "openid_connect=/icons/my-idp.svg,okta=https://example.com/okta.svg"
    # - a static, generation-time icon for providers with no bundled brand icon (see
    # apps/web/src/components/app-auth/icons/brands.tsx). Not required to point anywhere real -
    # nothing here fetches it, that's the browser's job at request time, same as any other <img src>.
    icon_entries = [e.strip() for e in social_login_provider_icons.split(",") if e.strip()]
    if not icon_entries:
        return

    icon_provider_ids = []
    for entry in icon_entries:
        if "=" not in entry:
            raise AnswersInvalid(
                f"'social_login_provider_icons' entry {entry!r} is missing '=' - each entry must be "
                "provider_id=url-or-path, e.g. openid_connect=/icons/my-idp.svg."
            )
        provider_id, _, icon_ref = entry.partition("=")
        provider_id = provider_id.strip()
        icon_ref = icon_ref.strip()
        if not provider_id or not icon_ref:
            raise AnswersInvalid(
                f"'social_login_provider_icons' entry {entry!r} needs a provider id and a URL/path "
                "on both sides of '='."
            )
        if provider_id not in KNOWN_PROVIDERS:
            raise AnswersInvalid(f"'social_login_provider_icons' names an unknown provider: {provider_id!r}.")
        icon_provider_ids.append(provider_id)

    duplicates = sorted({p for p in icon_provider_ids if icon_provider_ids.count(p) > 1})
    if duplicates:
        raise AnswersInvalid(
            f"'social_login_provider_icons' lists the same provider more than once: {', '.join(duplicates)}."
        )

    # "all" enables every provider, so nothing here can be unrequested under it - only a concrete
    # list can leave an icon pointed at a provider that isn't actually enabled.
    if requested_providers and requested_providers != ["all"]:
        unrequested = sorted(set(icon_provider_ids) - set(requested_providers))
        if unrequested:
            raise AnswersInvalid(
                f"'social_login_provider_icons' configures an icon for provider(s) not listed in "
                f"'social_login_providers': {', '.join(unrequested)}."
            )


def parse_requested_languages(languages: str) -> list[str]:
    return [code.strip() for code in languages.split(",") if code.strip()]


def validate_requested_languages(requested_languages: list[str]) -> None:
    if not requested_languages:
        raise AnswersInvalid("'languages' must list at least one language code, e.g. 'en' or 'en,tr'.")
    if requested_languages[0] != "en":
        raise AnswersInvalid(
            f"'languages' ({', '.join(requested_languages)}) must start with 'en' - every string in this "
            "template is authored in English first; other languages are translated from it, never instead of it."
        )
    duplicates = sorted({code for code in requested_languages if requested_languages.count(code) > 1})
    if duplicates:
        raise AnswersInvalid(f"'languages' lists the same language more than once: {', '.join(duplicates)}.")
    unknown = sorted(set(requested_languages) - KNOWN_LANGUAGES)
    if unknown:
        raise AnswersInvalid(
            f"Unknown languages: {', '.join(unknown)}. Valid values: {', '.join(sorted(KNOWN_LANGUAGES))}."
        )


def validate_answers(
    *,
    project_name: str,
    project_slug: str,
    repo_slug: str,
    description: str,
    author_name: str,
    author_email: str,
    domain: str,
    social_login_providers: str,
    social_login_provider_icons: str,
    languages: str = "en",
) -> None:
    validate_required_fields(
        project_name=project_name,
        description=description,
        author_name=author_name,
        author_email=author_email,
        # Equivalent mutant if dropped from this call (see mutation-exemptions.toml): the
        # validate_domain() call right below independently rejects a blank/whitespace-only
        # domain too, via its own "needs at least one dot" check.
        domain=domain,
    )
    validate_slugs(project_slug=project_slug, repo_slug=repo_slug)
    validate_free_text(project_name=project_name, description=description, author_email=author_email)
    validate_domain(domain)
    requested_providers = parse_requested_providers(social_login_providers)
    validate_requested_providers(requested_providers)
    validate_provider_icons(social_login_provider_icons, requested_providers)
    validate_requested_languages(parse_requested_languages(languages))
