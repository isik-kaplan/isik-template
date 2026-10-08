import json

import pytest
from allauth.account.models import EmailAddress
from allauth.socialaccount.providers import registry
from allauth.socialaccount.providers.github.provider import GitHubProvider
from allauth.socialaccount.providers.openid_connect.provider import OpenIDConnectProvider
from allauth.socialaccount.providers.openid_connect.views import OpenIDConnectOAuth2Adapter
from django.conf import settings
from django.urls import reverse
from isik.django.apps.common.db.constraints import lifted_constraint

from apps.users.models.user import User


AUTH_URLCONF = "{{ cookiecutter.project_slug }}.urls.auth"
PASSWORD = "correct-horse-battery-staple"
OIDC_PROVIDER_ID = "test-idp"
AUTHORIZATION_ENDPOINT = "https://idp.example.test/authorize"
TOKEN_ENDPOINT = "https://idp.example.test/token"
CALLBACK_URL = "https://auth.example.test/callback"


class Headless:
    """allauth's headless browser API through the test client, the way the frontend calls it: on the
    auth host, JSON in, with the CSRF token the session endpoint primes."""

    def __init__(self, client):
        self.client = client
        self.host = f"auth.{settings.PARENT_HOST}"

    @staticmethod
    def url(name):
        return reverse(f"headless:browser:{name}", urlconf=AUTH_URLCONF)

    def call(self, method, name, data=None):
        self.client.get(self.url("account:current_session"), HTTP_HOST=self.host)
        return self.client.generic(
            method,
            self.url(name),
            json.dumps(data) if data is not None else "",
            content_type="application/json",
            HTTP_HOST=self.host,
            HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value,
        )

    def prove(self, password=PASSWORD):
        response = self.call("POST", "account:reauthenticate", {"password": password})
        assert response.status_code == 200
        return response


@pytest.fixture
def a_second_language(settings, db):
    """The project as if it also shipped Turkish, whatever it was generated with. LANGUAGES says so,
    and the CHECK built from the languages it does ship is lifted for the test."""
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    with lifted_constraint(User, "users_user_language_choices"):
        yield


@pytest.fixture
def headless(client):
    return Headless(client)


@pytest.fixture
def alice(db):
    user = User.objects.create_user(username="alice", email="alice@example.test", password=PASSWORD)
    # Verified, so a password login through allauth signs her straight in.
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
    return user


@pytest.fixture
def signed_in(client, alice):
    client.force_login(alice)
    return alice


@pytest.fixture
def providers(settings, monkeypatch):
    """An OpenID Connect provider and a plain OAuth2 one, whatever this project was generated with -
    registered by hand, because allauth only registers the providers in INSTALLED_APPS, and given an
    issuer that answers without a network."""
    registry.load()
    for provider_class in (OpenIDConnectProvider, GitHubProvider):
        monkeypatch.setitem(registry.provider_map, provider_class.id, provider_class)
    app = {"client_id": "client", "secret": "secret", "key": ""}
    settings.SOCIALACCOUNT_PROVIDERS = {
        "openid_connect": {
            "APPS": [
                {
                    **app,
                    "provider_id": OIDC_PROVIDER_ID,
                    "name": "Test IdP",
                    "settings": {"server_url": "https://idp.example.test"},
                }
            ]
        },
        "github": {"APPS": [app]},
    }
    openid_config = {"authorization_endpoint": AUTHORIZATION_ENDPOINT, "token_endpoint": TOKEN_ENDPOINT}
    monkeypatch.setattr(OpenIDConnectOAuth2Adapter, "openid_config", property(lambda self: openid_config))
    # Its callback route only exists where the project enables openid_connect itself.
    monkeypatch.setattr(OpenIDConnectOAuth2Adapter, "get_callback_url", lambda self, request, app: CALLBACK_URL)
