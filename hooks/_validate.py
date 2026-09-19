"""The actual validation logic behind pre_gen_project.py's hook script.

Kept in its own plain (non-templated) module, importable and unit-testable directly - the hook
script itself is a Jinja template (cookiecutter renders it, then runs it as a subprocess), which
neither pytest nor mutmut's coverage tracking can see into.
"""


class AnswersInvalid(ValueError):
    """Raised with the exact message the hook should print and exit 1 over."""


REQUIRED_FIELDS = ("project_name", "description", "author_name", "author_email", "domain")

# allauth.socialaccount.providers/* provider ids, minus non-provider dirs (base, oauth, oauth2)
# and internal subdirs (__pycache__, static, templates, data, migrations). Keep in sync with the
# expansion list in the generated project's settings.py (see Phase 4) if this ever changes.
KNOWN_PROVIDERS = {
    "agave", "amazon", "amazon_cognito", "apple", "asana", "atlassian", "auth0", "authentiq",
    "baidu", "basecamp", "battlenet", "bitbucket_oauth2", "bitly", "box", "cilogon", "clever",
    "coinbase", "dataporten", "daum", "digitalocean", "dingtalk", "discogs", "discord", "disqus",
    "douban", "doximity", "draugiem", "drip", "dropbox", "dummy", "dwolla", "edmodo", "edx",
    "eventbrite", "eveonline", "evernote", "exist", "facebook", "feedly", "figma", "fivehundredpx",
    "flickr", "foursquare", "frontier", "fxa", "gitea", "github", "gitlab", "globus", "google",
    "gumroad", "hubic", "hubspot", "instagram", "jupyterhub", "kakao", "klaviyo", "lemonldap",
    "lichess", "line", "linkedin_oauth2", "mailchimp", "mailcow", "mailru", "mediawiki", "meetup",
    "microsoft", "miro", "naver", "netiq", "nextcloud", "notion", "okta", "openid",
    "openid_connect", "openstreetmap", "orcid", "patreon", "paypal", "pinterest", "pocket",
    "questrade", "quickbooks", "reddit", "robinhood", "salesforce", "saml", "sharefile", "shopify",
    "slack", "snapchat", "soundcloud", "spotify", "stackexchange", "steam", "stocktwits", "strava",
    "stripe", "telegram", "tiktok", "trainingpeaks", "trello", "tumblr", "tumblr_oauth2",
    "twentythreeandme", "twitch", "twitter", "twitter_oauth2", "untappd", "vimeo", "vimeo_oauth2",
    "vk", "wahoo", "weibo", "weixin", "windowslive", "xing", "yahoo", "yandex", "ynab", "zoho",
    "zoom",
}


def validate_required_fields(**fields: str) -> None:
    for field_name, value in fields.items():
        if not value.strip():
            raise AnswersInvalid(
                f"'{field_name}' is required and has no default - re-run cookiecutter and provide a real value."
            )


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


def validate_answers(
    *,
    project_name: str,
    description: str,
    author_name: str,
    author_email: str,
    domain: str,
    social_login_providers: str,
    social_login_provider_icons: str,
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
    validate_domain(domain)
    requested_providers = parse_requested_providers(social_login_providers)
    validate_requested_providers(requested_providers)
    validate_provider_icons(social_login_provider_icons, requested_providers)
