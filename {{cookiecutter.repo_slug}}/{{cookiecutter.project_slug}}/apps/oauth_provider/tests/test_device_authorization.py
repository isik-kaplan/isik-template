from datetime import timedelta
from urllib.parse import urlencode

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from oauth2_provider.models import get_access_token_model, get_device_grant_model
from oauthlib.common import Request as OAuthlibRequest
from oauthlib.oauth2.rfc6749 import errors

from apps.oauth_provider.device_codes import ALPHABET, LENGTH, as_stored, spend_device_code, user_code
from apps.oauth_provider.services import deciding
from apps.oauth_provider.tests.conftest import auth_host, make_application, o, permission, set_approval
from apps.users.models.user import User


AccessToken = get_access_token_model()
DeviceGrant = get_device_grant_model()

DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
USERS = reverse("users-list")


def _detail(code, action=None):
    if action:
        return reverse(f"device-authorizations-{action}", args=[code])
    return reverse("device-authorizations-detail", args=[code])


@pytest.fixture
def cli(db, alice):
    """A command line alice registered, approved for reading the people list."""
    with deciding():
        application = make_application(
            name="Acme CLI",
            description="Your people, in a terminal.",
            user=alice,
            client_type="public",
            authorization_grant_type=DEVICE_GRANT,
            redirect_uris="",
            approval="approved",
        )
        application.requested_scopes.set([permission("users:manage:user")])
        application.approved_scopes.set([permission("users:manage:user")])
    return application


def _device_authorization(**body):
    """What a device posts to start: a form, as RFC 8628 has it."""
    return Client().post(
        o("device-authorization"),
        urlencode(body),
        content_type="application/x-www-form-urlencoded",
        HTTP_HOST=auth_host(),
    )


def _ask(application, scope="openid users:manage:user"):
    """The device's first call: the codes, for nobody yet."""
    response = _device_authorization(client_id=application.client_id, scope=scope)
    assert response.status_code == 200, response.content
    return response.json()


def _poll(application, device_code, client_id=None):
    return Client().post(
        o("token"),
        {"grant_type": DEVICE_GRANT, "device_code": device_code, "client_id": client_id or application.client_id},
        HTTP_HOST=auth_host(),
    )


@pytest.fixture
def manager(signed_in):
    signed_in.user_permissions.add(permission("users:manage:user"))
    return signed_in


def test_a_code_is_eight_consonants_nobody_misreads():
    codes = {user_code() for _ in range(50)}

    assert len(codes) == 50
    assert all(len(code) == LENGTH and set(code) <= set(ALPHABET) for code in codes)


@pytest.mark.parametrize("typed", ["bcdf-ghjk", " BCDF GHJK ", "bcdfghjk"])
def test_a_code_is_read_however_it_was_typed(typed):
    assert as_stored(typed) == "BCDFGHJK"


@pytest.mark.django_db
def test_the_device_is_told_where_to_send_somebody_and_with_what(provider, cli):
    codes = _ask(cli)

    frontend = provider.FRONTEND_ORIGIN
    assert codes["verification_uri"] == f"{frontend}/device"
    assert codes["verification_uri_complete"] == f"{frontend}/device?code={codes['user_code']}"
    assert set(codes["user_code"]) <= set(ALPHABET)


@pytest.mark.django_db
def test_somebody_signed_in_sees_what_the_device_asks_for(client, provider, cli, signed_in):
    codes = _ask(cli)

    response = client.get(_detail(codes["user_code"].lower()))

    assert response.json() == {
        "user_code": codes["user_code"],
        "application_name": "Acme CLI",
        "application_description": "Your people, in a terminal.",
        "scopes": ["openid", "users:manage:user"],
    }


@pytest.mark.django_db
def test_allowed_the_device_gets_one_token_acting_for_whoever_allowed_it(client, provider, cli, manager):
    User.objects.create_user(username="bob")
    codes = _ask(cli)
    assert _poll(cli, codes["device_code"]).json()["error"] == "authorization_pending"

    assert client.post(_detail(codes["user_code"], "approve")).status_code == 204
    tokens = _poll(cli, codes["device_code"]).json()

    response = Client().get(USERS, HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")
    assert [row["username"] for row in response.json()["results"]] == ["alice", "bob"]
    assert AccessToken.objects.get().user == manager
    # A second poll mints nothing more: the code bought one token.
    assert _poll(cli, codes["device_code"]).json()["error"] == "expired_token"
    assert AccessToken.objects.count() == 1


@pytest.mark.django_db
def test_a_device_code_is_spent_only_by_the_client_it_was_issued_to(client, provider, cli, signed_in):
    codes = _ask(cli)
    client.post(_detail(codes["user_code"], "approve"))
    with deciding():
        other = make_application(
            name="Other CLI",
            user=signed_in,
            client_type="public",
            authorization_grant_type=DEVICE_GRANT,
            redirect_uris="",
            approval="approved",
        )

    assert _poll(cli, codes["device_code"], client_id=other.client_id).json()["error"] == "invalid_grant"
    assert not AccessToken.objects.exists()
    assert "access_token" in _poll(cli, codes["device_code"]).json()


@pytest.mark.django_db
def test_turned_away_the_device_is_told_no(client, provider, cli, signed_in):
    codes = _ask(cli)

    assert client.post(_detail(codes["user_code"], "deny")).status_code == 204

    assert _poll(cli, codes["device_code"]).json()["error"] == "access_denied"
    assert DeviceGrant.objects.get().user == signed_in


@pytest.mark.django_db
@pytest.mark.parametrize("action", [None, "approve", "deny"])
def test_a_code_already_answered_is_not_found(client, provider, cli, signed_in, action):
    codes = _ask(cli)
    client.post(_detail(codes["user_code"], "approve"))

    response = client.post(_detail(codes["user_code"], action)) if action else client.get(_detail(codes["user_code"]))

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "That code is wrong, has expired or was already answered. Start again on the device."
    )


@pytest.mark.django_db
@pytest.mark.parametrize("action", [None, "approve"])
def test_an_expired_code_is_not_found(client, provider, cli, signed_in, action):
    codes = _ask(cli)
    DeviceGrant.objects.update(expires=timezone.now() - timedelta(seconds=1))

    response = client.post(_detail(codes["user_code"], action)) if action else client.get(_detail(codes["user_code"]))

    assert response.status_code == 404
    assert DeviceGrant.objects.get().status == DeviceGrant.AUTHORIZATION_PENDING


@pytest.mark.django_db
def test_a_code_nobody_was_given_is_not_found(client, provider, signed_in):
    assert client.get(_detail("BCDFGHJK")).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "withdrawn", "disabled"])
def test_a_device_whose_application_is_not_approved_is_not_found(client, provider, cli, signed_in, approval):
    codes = _ask(cli)
    set_approval(cli, approval)

    response = client.get(_detail(codes["user_code"]))
    assert response.status_code == 404
    assert response.json()["detail"] == (
        "That code is wrong, has expired or was already answered. Start again on the device."
    )
    assert client.post(_detail(codes["user_code"], "approve")).status_code == 404


@pytest.mark.django_db
def test_an_application_that_signs_people_in_by_redirect_is_no_device(client, provider, cli, application, signed_in):
    grant = DeviceGrant.objects.create(
        client_id=application.client_id,
        device_code="the-device-code",
        user_code="BCDFGHJK",
        expires=timezone.now() + timedelta(minutes=5),
    )

    assert client.get(_detail(grant.user_code)).status_code == 404


@pytest.mark.django_db
def test_a_device_cannot_ask_for_more_than_its_application_was_approved_for(provider, cli):
    response = _device_authorization(client_id=cli.client_id, scope="openid users:grant:rights")

    assert response.status_code == 400
    assert response.json() == {"error": "invalid_scope"}
    assert not DeviceGrant.objects.exists()


@pytest.mark.django_db
def test_an_application_not_approved_gets_no_codes(provider, cli):
    set_approval(cli, "pending")

    # oauthlib's word for a client_id it does not know.
    assert _device_authorization(client_id=cli.client_id).json()["error"] == "invalid_request"
    assert not DeviceGrant.objects.exists()


@pytest.mark.django_db
def test_an_application_that_signs_people_in_by_redirect_gets_no_codes(provider, application):
    response = _device_authorization(client_id=application.client_id)

    assert response.status_code == 400
    assert response.json() == {"error": "unauthorized_client"}
    assert not DeviceGrant.objects.exists()


@pytest.mark.django_db
def test_a_device_asking_for_nothing_in_particular_gets_the_default(provider, cli):
    _device_authorization(client_id=cli.client_id)

    assert DeviceGrant.objects.get().scope == "openid"


@pytest.mark.django_db
def test_nobody_signed_in_answers_no_device(client, provider, cli):
    codes = _ask(cli)

    assert client.get(_detail(codes["user_code"])).status_code == 403
    assert client.post(_detail(codes["user_code"], "approve")).status_code == 403


@pytest.mark.django_db
def test_no_device_is_answered_while_the_provider_is_off(client, provider, cli, signed_in, settings):
    codes = _ask(cli)
    settings.OAUTH_PROVIDER_MODE = "off"

    response = client.get(_detail(codes["user_code"]))

    assert response.status_code == 403
    assert response.json()["detail"] == "No device signs anybody in here."


def _token_request(device_code, client_id):
    """What oauthlib hands the pre-token step of a device's poll."""
    request = OAuthlibRequest(
        "https://auth.example.test/o/token/",
        http_method="POST",
        body=urlencode({"grant_type": DEVICE_GRANT, "device_code": device_code, "client_id": client_id}),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    request.client_id = client_id
    return request


def _grant(device_code, *, user=None, status=DeviceGrant.AUTHORIZED, client_id="the-cli", scope="openid"):
    return DeviceGrant.objects.create(
        client_id=client_id,
        device_code=device_code,
        user_code=device_code[:8].upper(),
        scope=scope,
        status=status,
        user=user,
        expires=timezone.now() + timedelta(minutes=5),
    )


@pytest.mark.django_db
def test_an_authorized_code_is_spent_for_whoever_allowed_it_and_what_it_asked(alice):
    bob = User.objects.create_user(username="bob")
    _grant("code-for-bob", user=bob, scope="openid users:manage:user")
    _grant("code-for-alice", user=alice)
    request = _token_request("code-for-alice", "the-cli")

    spend_device_code(request)

    assert request.user == alice
    assert request.scopes == ["openid"]
    statuses = dict(DeviceGrant.objects.values_list("device_code", "status"))
    assert statuses == {"code-for-alice": DeviceGrant.EXPIRED, "code-for-bob": DeviceGrant.AUTHORIZED}


@pytest.mark.django_db
@pytest.mark.parametrize("status", [DeviceGrant.AUTHORIZATION_PENDING, DeviceGrant.DENIED, DeviceGrant.EXPIRED])
def test_a_code_nobody_allowed_buys_nothing(alice, status):
    _grant("the-code", user=alice, status=status)

    with pytest.raises(errors.InvalidGrantError) as refused:
        spend_device_code(_token_request("the-code", "the-cli"))

    assert refused.value.client_id == "the-cli"
    assert DeviceGrant.objects.get().status == status


@pytest.mark.django_db
def test_another_clients_code_buys_nothing(alice):
    _grant("the-code", user=alice, client_id="another-cli")

    with pytest.raises(errors.InvalidGrantError):
        spend_device_code(_token_request("the-code", "the-cli"))


@pytest.mark.django_db
def test_only_the_code_entered_is_answered(client, provider, cli, signed_in):
    first, second = _ask(cli), _ask(cli)

    client.post(_detail(second["user_code"], "approve"))

    statuses = dict(DeviceGrant.objects.values_list("user_code", "status"))
    assert statuses == {
        first["user_code"]: DeviceGrant.AUTHORIZATION_PENDING,
        second["user_code"]: DeviceGrant.AUTHORIZED,
    }


@pytest.mark.django_db
def test_a_device_may_ask_for_everything_its_application_may(provider, cli):
    response = _device_authorization(client_id=cli.client_id, scope="openid profile email users:manage:user")

    assert response.status_code == 200


@pytest.mark.django_db
def test_a_client_nobody_registered_is_refused_as_no_client(provider):
    response = _device_authorization(client_id="nobody-registered-this")

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_request"
