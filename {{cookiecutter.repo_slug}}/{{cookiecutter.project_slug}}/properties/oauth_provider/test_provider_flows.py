"""The provider's own views and hooks, switched on: what reaches consent, what a device may ask for, what a
token carries, and that nothing reaches a token once its application or person is shut out."""

from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

import pytest
from django.conf import settings
from django.db import transaction
from django.test import Client
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from oauth2_provider.models import get_access_token_model, get_device_grant_model
from oauthlib.common import Request as OAuthlibRequest
from oauthlib.oauth2.rfc6749 import errors

from apps.common.links import api_path
from apps.oauth_provider.device_codes import spend_device_code
from apps.oauth_provider.services import deciding
from apps.oauth_provider.tests import conftest as oauth
from apps.oauth_provider.tests.conftest import (
    auth_host,
    authorize_params,
    make_application,
    o,
    permission,
    set_approval,
)
from apps.oauth_provider.token_scopes import TokenScopes
from apps.users.models.user import User


# Fixtures, shared the way the example suite's conftests share them.
alice = oauth.alice
application = oauth.application
provider = oauth.provider


pytestmark = pytest.mark.django_db

AccessToken = get_access_token_model()
DeviceGrant = get_device_grant_model()

DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
MANAGE = "users:manage:user"
SIGN_IN = ["openid", "profile", "email"]
APPROVALS = ["pending", "approved", "withdrawn", "disabled"]
TEXT = st.text(st.characters(codec="ascii", categories=["L", "N"]), min_size=1, max_size=12)


def _authorize(client, application, **overrides):
    return client.get(o("authorize"), authorize_params(application, **overrides), HTTP_HOST=auth_host())


@pytest.mark.parametrize("prompt", ["login", "consent login", "consent", ""])
@given(state=TEXT, nonce=st.none() | TEXT, scopes=st.sets(st.sampled_from(SIGN_IN)))
def test_a_signed_in_person_is_sent_to_consent_unless_a_fresh_sign_in_was_asked_for(
    client, provider, application, prompt, state, nonce, scopes
):
    with transaction.atomic():
        client.force_login(application.user)
        scope = " ".join(sorted({"openid", *scopes}))
        extra = {"nonce": nonce} if nonce else {}
        response = _authorize(client, application, prompt=prompt, state=state, scope=scope, **extra)

        location = urlsplit(response["Location"])
        if "login" in prompt.split():
            assert location.path == o("authorize")
            assert "_auth_user_id" not in client.session
        else:
            query = parse_qs(location.query)
            assert f"{location.scheme}://{location.netloc}{location.path}".endswith("/auth/oauth/authorize")
            assert query["state"] == [state]
            assert query.get("nonce") == ([nonce] if nonce else None)
            assert sorted(query["scope"][0].split()) == sorted(scope.split())
            assert "claims" not in query
        transaction.set_rollback(True)


@given(state=TEXT, nonce=st.none() | TEXT, scopes=st.sets(st.sampled_from(SIGN_IN)))
def test_a_silent_sign_in_is_never_granted_and_goes_back_to_the_client_with_login_required(
    client, provider, application, state, nonce, scopes
):
    with transaction.atomic():
        client.force_login(application.user)
        scope = " ".join(sorted({"openid", *scopes}))
        extra = {"nonce": nonce} if nonce else {}
        response = _authorize(client, application, prompt="none", state=state, scope=scope, **extra)

        assert response.status_code == 302, response.content
        location = urlsplit(response["Location"])
        assert f"{location.scheme}://{location.netloc}{location.path}" == oauth.REDIRECT_URI
        query = parse_qs(location.query)
        assert (query["error"], query["state"]) == (["login_required"], [state])
        assert "code" not in query
        transaction.set_rollback(True)


@given(client_id=TEXT)
def test_an_unknown_client_is_sent_to_the_frontends_error_page(client, provider, application, client_id):
    with transaction.atomic():
        client.force_login(application.user)
        response = _authorize(client, application, client_id=f"nobody-{client_id}")

        location = urlsplit(response["Location"])
        assert f"{location.scheme}://{location.netloc}{location.path}" == (
            f"{settings.FRONTEND_ORIGIN}/auth/oauth/error"
        )
        assert parse_qs(location.query)["error"]
        transaction.set_rollback(True)


def _device(application_or_id, scope):
    client_id = getattr(application_or_id, "client_id", application_or_id)
    return Client().post(
        o("device-authorization"),
        urlencode({"client_id": client_id, "scope": scope}),
        content_type="application/x-www-form-urlencoded",
        HTTP_HOST=auth_host(),
    )


@pytest.fixture
def cli(db, alice):
    with deciding():
        application = make_application(
            name="Acme CLI",
            user=alice,
            client_type="public",
            authorization_grant_type=DEVICE_GRANT,
            redirect_uris="",
            approval="approved",
        )
        application.requested_scopes.set([permission(MANAGE)])
        application.approved_scopes.set([permission(MANAGE)])
    return application


@pytest.mark.parametrize("approval", APPROVALS)
@given(asked=st.sets(st.sampled_from([*SIGN_IN, MANAGE, "users:manage:group", "made:up"])))
def test_a_device_gets_codes_only_for_scopes_its_approved_application_may_ask_for(provider, cli, approval, asked):
    with transaction.atomic():
        set_approval(cli, approval)
        response = _device(cli, " ".join(sorted(asked)))

        if approval != "approved":
            # Refused by DOT's own client check, never as a scope question.
            assert response.status_code != 200
        elif asked <= {*SIGN_IN, MANAGE}:
            assert response.status_code == 200, response.content
            assert set(response.json()) >= {"device_code", "user_code"}
        else:
            assert (response.status_code, response.json()["error"]) == (400, "invalid_scope")
        transaction.set_rollback(True)


@given(asked=st.sets(st.sampled_from([*SIGN_IN, MANAGE])))
def test_a_redirect_flow_client_never_starts_the_device_flow(provider, application, asked):
    response = _device(application, " ".join(sorted(asked)))

    assert (response.status_code, response.json()["error"]) == (400, "unauthorized_client")


@pytest.mark.parametrize("status", ["authorized", "authorization-pending", "denied", "expired"])
@given(scopes=st.sets(st.sampled_from([*SIGN_IN, MANAGE]), min_size=1), mine=st.booleans())
def test_a_device_code_buys_exactly_one_token_for_its_own_client_once_authorized(cli, status, scopes, mine):
    with transaction.atomic():
        grant = DeviceGrant.objects.create(
            device_code="the-device-code",
            user_code="BCDFGHJK",
            client_id=cli.client_id,
            status=status,
            user=cli.user,
            scope=" ".join(sorted(scopes)),
            expires=timezone.now() + timedelta(minutes=5),
        )
        client_id = cli.client_id if mine else "another-client"
        request = OAuthlibRequest(
            "https://auth.example.test/o/token/",
            http_method="POST",
            body=urlencode({"grant_type": DEVICE_GRANT, "device_code": "the-device-code", "client_id": client_id}),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        request.client_id = client_id

        if status == "authorized" and mine:
            spend_device_code(request)
            assert (request.user, sorted(request.scopes)) == (cli.user, sorted(scopes))
            grant.refresh_from_db()
            assert grant.status == "expired"
            with pytest.raises(errors.InvalidGrantError):
                spend_device_code(request)
        else:
            with pytest.raises(errors.InvalidGrantError):
                spend_device_code(request)
        transaction.set_rollback(True)


def _bearer(path, token):
    return Client().get(path, HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.parametrize("approval", APPROVALS)
@pytest.mark.parametrize("active", [True, False])
@given(granted=st.sets(st.sampled_from([*SIGN_IN, MANAGE, "made:up"])), approved=st.booleans())
def test_a_token_lists_people_only_with_a_scope_still_approved_held_by_an_active_person(
    provider, application, approval, active, granted, approved
):
    with transaction.atomic():
        person = application.user
        person.user_permissions.add(permission(MANAGE))
        User.objects.filter(pk=person.pk).update(is_active=active)
        User.objects.create_user(username="bob", email="bob@example.test")
        if not approved:
            application.approved_scopes.clear()
        set_approval(application, approval)
        AccessToken.objects.create(
            user=person,
            application=application,
            token="the-token",
            scope=" ".join(sorted(granted)),
            expires=timezone.now() + timedelta(hours=1),
        )

        response = _bearer(api_path("users:users-list"), "the-token")

        if approval != "approved" or not active:
            assert response.status_code in (401, 403)
        else:
            assert response.status_code == 200
            usernames = sorted(row["username"] for row in response.json()["results"])
            assert usernames == (["alice", "bob"] if MANAGE in granted and approved else ["alice"])
        transaction.set_rollback(True)


@pytest.mark.parametrize(
    "path",
    [
        api_path("users:users-me"),
        api_path("oauth_provider:applications-list"),
        api_path("oauth_provider:authorized-applications-list"),
    ],
)
@given(granted=st.sets(st.sampled_from([*SIGN_IN, MANAGE])))
def test_a_token_reaches_nothing_its_view_does_not_name(provider, application, path, granted):
    with transaction.atomic():
        AccessToken.objects.create(
            user=application.user,
            application=application,
            token="the-token",
            scope=" ".join(sorted(granted)),
            expires=timezone.now() + timedelta(hours=1),
        )

        response = _bearer(path, "the-token")

        assert response.status_code == 403
        assert response.json()["detail"] == "Applications cannot do this on anybody's behalf."
        transaction.set_rollback(True)


@pytest.mark.parametrize("mode", ["off", "approval"])
@pytest.mark.parametrize("scheme", ["Bearer", "Basic", "Token"])
@given(token=TEXT)
def test_an_unknown_or_switched_off_token_is_nobodys(provider, mode, scheme, token):
    provider.OAUTH_PROVIDER_MODE = mode
    response = Client().get(api_path("users:users-list"), HTTP_AUTHORIZATION=f"{scheme} unknown-{token}")

    assert response.status_code in (401, 403)


@given(approved=st.sets(st.sampled_from([MANAGE, "users:grant:rights"])), with_application=st.booleans())
def test_an_application_may_ask_for_the_sign_in_scopes_and_what_it_was_approved_for(
    application, approved, with_application
):
    with transaction.atomic():
        with deciding():
            application.requested_scopes.set([permission(name) for name in approved])
            application.approved_scopes.set([permission(name) for name in approved])
        backend = TokenScopes()

        available = backend.get_available_scopes(application=application if with_application else None)

        assert available == SIGN_IN + (sorted(approved) if with_application else [])
        assert backend.get_default_scopes() == ["openid"]
        assert set(available) <= set(backend.get_all_scopes())
        transaction.set_rollback(True)
