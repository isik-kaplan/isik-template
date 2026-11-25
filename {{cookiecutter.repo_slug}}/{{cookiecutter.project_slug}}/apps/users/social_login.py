import pkgutil
import re

import allauth.socialaccount.providers as providers_package
from django.core.exceptions import ImproperlyConfigured


OIDC = "openid_connect"
# What an issuer is called: its callback, its credentials' variables and its button's name.
ISSUER = re.compile(r"[a-z][a-z0-9_-]*")


def provider_of(entry: str) -> str:
    """The allauth provider an entry names: `openid_connect:<issuer>` is openid_connect's."""
    return entry.partition(":")[0]


def social_login_provider_ids(requested: list[str]) -> list[str]:
    """Fails startup on an unknown or repeated provider, which would otherwise be a dead login button. Each
    OpenID Connect issuer is `openid_connect:<issuer>`, so several can sit side by side."""
    ids = [provider_id.strip() for provider_id in requested if provider_id.strip()]
    # base, oauth and oauth2 are shared bases, not providers.
    shipped = {name for _, name, _ in pkgutil.iter_modules(providers_package.__path__)} - {"base", "oauth", "oauth2"}
    unknown = sorted({provider_of(entry) for entry in ids} - shipped)
    if unknown:
        raise ImproperlyConfigured(f"SOCIAL_LOGIN__PROVIDERS names unknown providers: {', '.join(unknown)}")
    unnamed = sorted(
        entry for entry in ids if (provider_of(entry) == OIDC) != bool(ISSUER.fullmatch(entry.partition(":")[2]))
    )
    if unnamed:
        raise ImproperlyConfigured(
            f"SOCIAL_LOGIN__PROVIDERS needs each OpenID Connect issuer as {OIDC}:<issuer>, a-z first, "
            f"and nothing else with a colon: {', '.join(unnamed)}"
        )
    repeated = sorted({provider_id for provider_id in ids if ids.count(provider_id) > 1})
    if repeated:
        raise ImproperlyConfigured(f"SOCIAL_LOGIN__PROVIDERS names a provider more than once: {', '.join(repeated)}")
    return ids


def social_app(entry: str, environ, prefix: str) -> dict:
    """One app's settings, read from `<prefix>__<ID>__*`: the provider's id, or an issuer's own name."""
    provider, _, issuer = entry.partition(":")
    variables = f"{prefix}__{(issuer or provider).upper().replace('-', '_')}"
    app = {
        "client_id": environ.get(f"{variables}__CLIENT_ID", ""),
        "secret": environ.get(f"{variables}__CLIENT_SECRET", ""),
        "key": "",
    }
    if issuer:
        # The issuer's name builds its callback URL, so it must match the IdP's registered redirect_uri.
        app["provider_id"] = issuer
        # Named as the web's button names it when nothing else does: customer-login reads Customer Login.
        named = " ".join(word.capitalize() for word in re.split(r"[_-]", issuer))
        app["name"] = environ.get(f"{variables}__NAME", named)
        app["settings"] = {"server_url": environ.get(f"{variables}__SERVER_URL", "")}
    return app


def social_account_providers(entries: list[str], environ, prefix: str) -> dict:
    """SOCIALACCOUNT_PROVIDERS: settings, not SocialApp rows, so there is nothing to seed. Issuers share one."""
    providers = {}
    for entry in entries:
        providers.setdefault(provider_of(entry), {"APPS": []})["APPS"].append(social_app(entry, environ, prefix))
    return providers


def social_login_only(only: bool, provider_ids: list[str], debug: bool) -> bool:
    """Fails startup when nobody could sign in at all; in development a superuser still can, in the admin."""
    if only and not provider_ids and not debug:
        raise ImproperlyConfigured("SOCIAL_LOGIN__ONLY needs at least one provider in SOCIAL_LOGIN__PROVIDERS")
    return only


def reauthentication_methods(only: bool) -> list[str]:
    """A proof counts whatever its method. Without passwords a code by email takes the password's place."""
    return ["code", "mfa"] if only else ["password", "mfa"]
