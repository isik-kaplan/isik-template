from urllib.parse import parse_qs, urlsplit

import pytest
from django.conf import settings

from apps.oauth_provider.tests.conftest import (
    REDIRECT_URI,
    auth_host,
    authorize_params,
    consent,
    o,
    set_approval,
    tokens_for,
)
from apps.users.models.site_settings import SiteSettings


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
        "application_description": ["Notes about the people you work with."],
        "scopes_descriptions": ['["Who you are", "Your name and username", "Your email address"]'],
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


@pytest.mark.django_db
def test_the_consent_page_is_told_what_a_permission_it_asks_for_lets_it_do(client, provider, application, signed_in):
    response = _authorize(client, application, scope="openid users:manage:user")

    assert parse_qs(urlsplit(response["Location"]).query)["scopes_descriptions"] == [
        '["Who you are", "See everybody\'s account, and activate or deactivate them"]'
    ]


@pytest.mark.django_db
def test_a_scope_the_application_was_not_approved_for_is_refused_to_it(client, provider, application, signed_in):
    response = _authorize(client, application, scope="openid users:grant:rights")

    location = urlsplit(response["Location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == REDIRECT_URI
    assert parse_qs(location.query)["error"] == ["invalid_scope"]


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "withdrawn", "disabled"])
def test_an_application_that_is_not_approved_signs_nobody_in(client, provider, application, signed_in, approval):
    set_approval(application, approval)

    response = _authorize(client, application)

    assert response["Location"] == f"{settings.FRONTEND_ORIGIN}/auth/oauth/error?error=invalid_request"


@pytest.mark.django_db
def test_an_application_nobody_registered_is_sent_nowhere_it_names(client, provider, application, signed_in):
    response = _authorize(client, application, client_id="nobody-registered-this")

    assert response["Location"] == f"{settings.FRONTEND_ORIGIN}/auth/oauth/error?error=invalid_request"


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["withdrawn", "disabled"])
def test_a_token_stops_working_once_its_application_is_taken_down(client, provider, application, signed_in, approval):
    tokens = tokens_for(client, application)
    set_approval(application, approval)

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")
    refreshed = client.post(
        o("token"),
        {
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
            "client_id": application.client_id,
            "client_secret": application.issued_secret,
        },
        HTTP_HOST=auth_host(),
    )

    assert userinfo.status_code == 401
    assert refreshed.status_code == 401


@pytest.mark.django_db
def test_a_token_stops_working_once_its_person_is_deactivated(client, provider, application, signed_in):
    tokens = tokens_for(client, application)
    signed_in.is_active = False
    signed_in.save()

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")

    assert userinfo.status_code == 401


@pytest.mark.django_db
def test_a_token_stops_working_once_the_login_policy_shuts_its_person_out(client, provider, application, signed_in):
    tokens = tokens_for(client, application)
    settings_row = SiteSettings.current()
    settings_row.login_policy = SiteSettings.LoginPolicy.SUPERUSERS
    settings_row.save()

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")

    assert userinfo.status_code == 401


@pytest.mark.django_db
def test_who_somebody_is_is_read_only_with_a_token_that_was_let_ask(client, provider, application, signed_in):
    """userinfo asks for openid; a token let have the profile alone is not one it answers."""
    tokens = tokens_for(client, application, scope="profile")

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")

    # DOT words a token short of the scope the same as one that is no token at all.
    assert userinfo.status_code == 401
