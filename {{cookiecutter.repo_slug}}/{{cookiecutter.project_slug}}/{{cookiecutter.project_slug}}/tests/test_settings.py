import os
import subprocess
import sys

import pytest
from allauth.utils import build_absolute_uri
from django.conf import settings
from django.test import RequestFactory, override_settings

from {{ cookiecutter.project_slug }}.config import CONFIG as config
from {{ cookiecutter.project_slug }}.settings import _origins, _social_app_config


PREFIX = "{{ cookiecutter.config_prefix }}__OAUTH"


def test_social_app_config_reads_client_credentials_from_env(monkeypatch):
    monkeypatch.setenv(f"{PREFIX}__GOOGLE__CLIENT_ID", "a-client-id")
    monkeypatch.setenv(f"{PREFIX}__GOOGLE__CLIENT_SECRET", "a-client-secret")

    assert _social_app_config("google") == {"client_id": "a-client-id", "secret": "a-client-secret", "key": ""}


def test_social_app_config_defaults_credentials_to_empty_strings(monkeypatch):
    monkeypatch.delenv(f"{PREFIX}__GITHUB__CLIENT_ID", raising=False)
    monkeypatch.delenv(f"{PREFIX}__GITHUB__CLIENT_SECRET", raising=False)

    assert _social_app_config("github") == {"client_id": "", "secret": "", "key": ""}


def test_social_app_config_adds_openid_connect_specific_fields(monkeypatch):
    monkeypatch.setenv(f"{PREFIX}__OPENID_CONNECT__PROVIDER_ID", "my-idp")
    monkeypatch.setenv(f"{PREFIX}__OPENID_CONNECT__SERVER_URL", "https://idp.example.test")

    config = _social_app_config("openid_connect")

    assert config["provider_id"] == "my-idp"
    assert config["name"] == "OpenID Connect"
    assert config["settings"] == {"server_url": "https://idp.example.test"}


def test_social_app_config_openid_connect_defaults(monkeypatch):
    monkeypatch.delenv(f"{PREFIX}__OPENID_CONNECT__PROVIDER_ID", raising=False)
    monkeypatch.delenv(f"{PREFIX}__OPENID_CONNECT__SERVER_URL", raising=False)

    config = _social_app_config("openid_connect")

    assert config["provider_id"] == "openid_connect"
    assert config["settings"] == {"server_url": ""}


def test_social_app_config_openid_connect_fields_are_absent_for_other_providers():
    assert "provider_id" not in _social_app_config("google")
    assert "name" not in _social_app_config("google")
    assert "settings" not in _social_app_config("google")


def test_origins_under_debug_accept_both_schemes_so_local_https_works_beside_http():
    assert _origins(["a.test", "api.a.test"], True) == [
        "http://a.test",
        "https://a.test",
        "http://api.a.test",
        "https://api.a.test",
    ]


def test_origins_outside_debug_are_https_only():
    assert _origins(["a.test", "api.a.test"], False) == ["https://a.test", "https://api.a.test"]


# config.DEBUG, not settings.DEBUG: pytest-django forces the latter off after these lists were built.
def test_csrf_trusts_the_frontend_and_every_backend_subdomain():
    hosts = [config.DOMAIN, f"api.{config.DOMAIN}", f"admin.{config.DOMAIN}", f"auth.{config.DOMAIN}"]
    assert settings.CSRF_TRUSTED_ORIGINS == _origins(hosts, config.DEBUG)


def test_cors_allows_only_the_frontend_origin():
    assert settings.CORS_ALLOWED_ORIGINS == _origins([config.DOMAIN], config.DEBUG)


@pytest.mark.parametrize(
    ("debug", "expected"),
    [("false", ["31536000", "True", "False"]), ("true", ["0", "False", "False"])],
)
def test_outside_debug_browsers_stay_on_https_for_a_year_across_subdomains(debug, expected):
    """Settings are built once, at import, from the environment - so each DEBUG is read in an
    interpreter of its own. Preload stays off either way: it is the owner's one-way decision."""
    script = (
        "from {{ cookiecutter.project_slug }} import settings; "
        "print(settings.SECURE_HSTS_SECONDS, settings.SECURE_HSTS_INCLUDE_SUBDOMAINS, "
        "getattr(settings, 'SECURE_HSTS_PRELOAD', False))"
    )
    env = {**os.environ, "{{ cookiecutter.config_prefix }}__DEBUG": debug}

    result = subprocess.run([sys.executable, "-c", script], env=env, capture_output=True, text=True, check=True)

    assert result.stdout.splitlines()[-1].split() == expected
def test_allauth_forces_https_links_exactly_when_the_frontend_is_https():
    assert settings.ACCOUNT_DEFAULT_HTTP_PROTOCOL == ("http" if config.DEBUG else "https")


def test_absolute_uris_follow_the_forwarded_https_scheme():
    request = RequestFactory().get("/", HTTP_HOST=f"auth.{config.DOMAIN}", HTTP_X_FORWARDED_PROTO="https")

    assert build_absolute_uri(request, "/callback/") == f"https://auth.{config.DOMAIN}/callback/"


@override_settings(ACCOUNT_DEFAULT_HTTP_PROTOCOL="https")
def test_absolute_uris_are_https_outside_debug_even_without_the_forwarded_scheme():
    request = RequestFactory().get("/", HTTP_HOST=f"auth.{config.DOMAIN}")

    assert build_absolute_uri(request, "/callback/") == f"https://auth.{config.DOMAIN}/callback/"
