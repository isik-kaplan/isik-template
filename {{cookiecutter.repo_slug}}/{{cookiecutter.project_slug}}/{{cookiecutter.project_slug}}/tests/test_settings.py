from django.conf import settings

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
