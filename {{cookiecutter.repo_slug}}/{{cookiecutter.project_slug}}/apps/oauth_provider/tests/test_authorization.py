from urllib.parse import parse_qs, urlsplit

import pytest
from django.conf import settings

from apps.oauth_provider.tests.conftest import REDIRECT_URI, auth_host, authorize_params, consent, o, tokens_for


def _authorize(client, application, **overrides):
    return client.get(o("authorize"), authorize_params(application, **overrides), HTTP_HOST=auth_host())


@pytest.mark.django_db
def test_somebody_signed_out_is_sent_to_sign_in_and_back_to_the_authorize_endpoint(client, provider, application):
    response = _authorize(client, application)

    location = urlsplit(response["Location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == settings.LOGIN_URL
    back = urlsplit(parse_qs(location.query)["next"][0])
    assert (back.netloc, back.path) == (auth_host(), o("authorize"))
    assert parse_qs(back.query)["client_id"] == [application.client_id]


@pytest.mark.django_db
def test_somebody_signed_in_is_asked_on_the_frontends_consent_page(client, provider, application, signed_in):
    response = _authorize(client, application, nonce="the-nonce")

    location = urlsplit(response["Location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{settings.FRONTEND_ORIGIN}/auth/oauth/authorize"
    assert parse_qs(location.query) == {
        "application_name": ["Acme Notes"],
        "client_id": [application.client_id],
        "redirect_uri": [REDIRECT_URI],
        "response_type": ["code"],
        "scope": ["openid profile email"],
        "state": ["the-state"],
        "nonce": ["the-nonce"],
        "code_challenge": [authorize_params(application)["code_challenge"]],
        "code_challenge_method": ["S256"],
    }


@pytest.mark.django_db
def test_a_request_for_claims_is_carried_to_the_consent_page(client, provider, application, signed_in):
    response = _authorize(client, application, claims='{"id_token": {"email": null}}')

    assert parse_qs(urlsplit(response["Location"]).query)["claims"] == ['{"id_token": {"email": null}}']


@pytest.mark.django_db
def test_a_fresh_sign_in_asked_for_ends_the_session_first(client, provider, application, signed_in):
    response = _authorize(client, application, prompt="consent login")

    assert urlsplit(response["Location"]).path == o("authorize")
    assert "_auth_user_id" not in client.session


@pytest.mark.django_db
def test_another_prompt_leaves_the_session_alone(client, provider, application, signed_in):
    _authorize(client, application, prompt="consent")

    assert client.session["_auth_user_id"] == str(signed_in.pk)


@pytest.mark.django_db
def test_consenting_returns_a_code_to_the_application(client, provider, application, signed_in):
    response = consent(client, application)

    location = urlsplit(response["Location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == REDIRECT_URI
    assert parse_qs(location.query)["state"] == ["the-state"]
    assert parse_qs(location.query)["code"]


@pytest.mark.django_db
def test_declining_tells_the_application_it_was_refused(client, provider, application, signed_in):
    response = consent(client, application, allow=False)

    assert parse_qs(urlsplit(response["Location"]).query)["error"] == ["access_denied"]


@pytest.mark.django_db
def test_the_code_buys_tokens_and_the_tokens_say_who_consented(client, provider, application, signed_in):
    tokens = tokens_for(client, application)

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")
    assert userinfo.json()["sub"] == str(signed_in.pk)
    assert userinfo.json()["email"] == "alice@example.test"
    assert userinfo.json()["preferred_username"] == "alice"
    assert tokens["id_token"]


@pytest.mark.django_db
def test_only_the_granted_scopes_claims_are_handed_out(client, provider, application, signed_in):
    tokens = tokens_for(client, application, scope="openid")

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")
    assert "email" not in userinfo.json()
    assert "preferred_username" not in userinfo.json()


@pytest.mark.django_db
def test_a_code_without_its_verifier_buys_nothing(client, provider, application, signed_in):
    redirect = consent(client, application)
    code = parse_qs(urlsplit(redirect["Location"]).query)["code"][0]

    response = client.post(
        o("token"),
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": application.client_id,
            "client_secret": application.issued_secret,
        },
        HTTP_HOST=auth_host(),
    )

    assert response.status_code == 400
