import base64
import hashlib
from urllib.parse import parse_qs, urlsplit

import pgtrigger
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from oauth2_provider.models import get_application_model

from apps.oauth_provider.services import APPROVAL_GUARDS, deciding
from apps.users.permissions import Permission as PermissionName
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
    """The provider switched on, approving nothing by itself, with a key to sign id_tokens with."""
    settings.OAUTH_PROVIDER_MODE = "approval"
    settings.OAUTH2_PROVIDER = {**settings.OAUTH2_PROVIDER, "OIDC_RSA_PRIVATE_KEY": SIGNING_KEY}
    return settings


def permission(name):
    return Permission.objects.get(content_type=ContentType.objects.get_for_model(Permission), codename=str(name))


@pytest.fixture
def application(db, alice):
    """A confidential application alice registered and a superuser approved, asking to read the people list
    and approved for it, with the secret it was issued."""
    with deciding():
        application = make_application(
            name="Acme Notes",
            description="Notes about the people you work with.",
            user=alice,
            client_type=Application.CLIENT_CONFIDENTIAL,
            client_secret="the-client-secret",
            algorithm=Application.RS256_ALGORITHM,
            approval=Application.Approval.APPROVED,
        )
        application.requested_scopes.set([permission(PermissionName.USERS_MANAGE_USER)])
        application.approved_scopes.set([permission(PermissionName.USERS_MANAGE_USER)])
    application.issued_secret = "the-client-secret"
    return application


def make_application(**fields):
    """An application for the authorization code flow returning to REDIRECT_URI, unless told otherwise."""
    return Application.objects.create(
        **{"authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE, "redirect_uris": REDIRECT_URI, **fields}
    )


def set_approval(application, approval):
    """Puts an application in any state at all, past the trigger that keeps real moves to the lifecycle."""
    with pgtrigger.ignore("oauth_provider.Application:approval_follows_the_lifecycle", *APPROVAL_GUARDS):
        Application.objects.filter(pk=application.pk).update(approval=approval)
    application.refresh_from_db()


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
