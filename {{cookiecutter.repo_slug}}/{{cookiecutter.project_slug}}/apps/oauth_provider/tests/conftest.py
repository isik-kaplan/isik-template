import base64
import hashlib
from urllib.parse import parse_qs, urlsplit

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.urls import reverse
from oauth2_provider.models import get_application_model

from apps.users.tests import conftest as users


# The users app's own fixtures, shared: a conftest only reaches the tests beneath it.
alice = users.alice
signed_in = users.signed_in
headless = users.headless


Application = get_application_model()

AUTH_URLCONF = "{{ cookiecutter.project_slug }}.urls.auth"
REDIRECT_URI = "https://client.example.test/callback"
VERIFIER = "a-code-verifier-long-enough-to-satisfy-rfc-7636-forty-three-chars"
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()
SIGNING_KEY = (
    rsa.generate_private_key(public_exponent=65537, key_size=2048)
    .private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    .decode()
)


def auth_host():
    return f"auth.{settings.PARENT_HOST}"


def o(name):
    return reverse(f"oauth2_provider:{name}", urlconf=AUTH_URLCONF)


@pytest.fixture
def provider(settings):
    """The provider switched on, public, with a key to sign id_tokens with."""
    settings.OAUTH_PROVIDER_MODE = "public"
    settings.OAUTH2_PROVIDER = {**settings.OAUTH2_PROVIDER, "OIDC_RSA_PRIVATE_KEY": SIGNING_KEY}
    return settings


@pytest.fixture
def application(db, alice):
    """A confidential application alice registered, with the secret it was issued."""
    application = Application.objects.create(
        name="Acme Notes",
        user=alice,
        client_type=Application.CLIENT_CONFIDENTIAL,
        authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
        redirect_uris=REDIRECT_URI,
        client_secret="the-client-secret",
        algorithm=Application.RS256_ALGORITHM,
    )
    application.issued_secret = "the-client-secret"
    return application


def authorize_params(application, **overrides):
    return {
        "client_id": application.client_id,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": "openid profile email",
        "state": "the-state",
        "code_challenge": CHALLENGE,
        "code_challenge_method": "S256",
        **overrides,
    }


def consent(client, application, allow=True, **overrides):
    """Answers DOT's own consent form the way the frontend's page posts it."""
    data = authorize_params(application, **overrides)
    if allow:
        data["allow"] = "Authorize"
    return client.post(o("authorize"), data, HTTP_HOST=auth_host())


def tokens_for(client, application, scope="openid profile email"):
    """The whole authorization code flow for whoever `client` is signed in as: consent, then the code
    exchanged for tokens."""
    redirect = consent(client, application, scope=scope)
    code = parse_qs(urlsplit(redirect["Location"]).query)["code"][0]
    response = client.post(
        o("token"),
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": VERIFIER,
            "client_id": application.client_id,
            "client_secret": application.issued_secret,
        },
        HTTP_HOST=auth_host(),
    )
    assert response.status_code == 200, response.content
    return response.json()
