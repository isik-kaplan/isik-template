"""No request against a row that exists is answered with a server error.

The other half of every detail route: the lookup succeeds and the view, the serializer and the
services behind it run. Each row's id is read off the API's own list, so a route needs no entry here,
and the caller has just proved who they are, so a write reaches the view rather than the gate.
"""

import time
from datetime import timedelta
from urllib.parse import quote

import pytest
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.notifications import pipeline
from isik.django.apps.notifications.choices import DeliveryState
from oauth2_provider.models import get_access_token_model, get_device_grant_model

from apps.common.links import api_path
{%- if cookiecutter.webhooks != "none" %}
from apps.notifications.models import Delivery, Device, Endpoint, EndpointKind, NoticeKindPolicy
{%- else %}
from apps.notifications.models import Delivery, Device
{%- endif %}
from apps.oauth_provider import services
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token
from conftest import give_authentication_records
from properties.rest.surface import detail_operations


pytestmark = pytest.mark.django_db

HOST = f"api.{settings.PARENT_HOST}"
METHODS = ("get", "put", "patch", "delete", "post")
AccessToken = get_access_token_model()
DeviceGrant = get_device_grant_model()
SUBSCRIPTIONS = api_path("notifications:subscriptions-list")
USER_CODE = "BCDFGHJK"
# A collection with no list to read an id off.
UNLISTED = {"/v0/device-authorizations/": USER_CODE}
ROUTES = sorted({(method, path) for method in METHODS for path in detail_operations("api", method)})

SCALARS = (
    st.none()
    | st.booleans()
    | st.integers(min_value=-(10**12), max_value=10**12)
    | st.text(max_size=24)
    | st.lists(st.text(max_size=8), max_size=3)
)
# The names the API's own fields go by, so a body reaches validation rather than being ignored whole.
FIELD_NAMES = (
    "name url is_active is_staff scopes requested_scopes approved_scopes redirect_uris description revoke value "
    "kinds first_name last_name username language email".split()
)
FIELDS = st.sampled_from(FIELD_NAMES)
BODIES = st.dictionaries(FIELDS | st.text(min_size=1, max_size=12), SCALARS, max_size=5)


@pytest.fixture
def caller(client, settings, db):
    settings.OAUTH_PROVIDER_MODE = "approval"
    person = User.objects.create_user(email="fuzz@example.test", username="fuzz", is_staff=True, is_superuser=True)
    client.force_login(person)
    session = client.session
    give_authentication_records(session, person, [{"method": "password", "at": time.time(), "reauthenticated": True}])
    session.save()

{%- if cookiecutter.webhooks != "none" %}
    endpoint = Endpoint.objects.create(url="https://hooks.example.test/", secret="s3cret"{% if cookiecutter.webhooks == "users" %}, owner=person{% endif %})
    EndpointKind.objects.create(endpoint=endpoint, kind=NoticeKindPolicy.objects.get(name="token_created"))
{%- endif %}
    make_token(user=person, scopes=[], name="fuzzed")
    application = services.register_application(
        user=person, name="Fuzzed", redirect_uris="https://client.example.test/cb", requested_scopes=[]
    )
    services.approve_application(application, [])
    AccessToken.objects.create(
        user=person, application=application, token="fuzzed", expires=timezone.now() + timedelta(hours=1)
    )
    Device.objects.create(user=person, platform="apns", token="fuzzed", environment="sandbox", app_id="")
    DeviceGrant.objects.create(
        client_id=application.client_id,
        device_code="fuzzed-device-code",
        user_code=USER_CODE,
        scope="openid",
        expires=timezone.now() + timedelta(minutes=5),
    )
    client.post(SUBSCRIPTIONS, {"kind": "account_changed", "enabled": False}, content_type="application/json")
    pipeline.fan_out()
    # Not the webhook deliveries: sending one is a request to the endpoint's URL.
    waiting = Delivery.objects.filter(state=DeliveryState.PENDING).exclude(channel="webhook")
    list(map(pipeline.send, waiting.values_list("pk", flat=True)))
    return client


def _collection(path):
    return path.split("{pk}")[0]


def _an_id(caller, path):
    if _collection(path) in UNLISTED:
        return UNLISTED[_collection(path)]
    listed = caller.get(_collection(path), HTTP_HOST=HOST)
    # A collection this caller may not list has no id to offer.
    rows = listed.json() if listed.status_code == 200 else []
    rows = rows.get("results", rows) if isinstance(rows, dict) else rows
    return next((str(row.get("id", row.get("name", row.get("key")))) for row in rows), None)


def test_every_detail_route_found_a_row(caller):
    missing = sorted({_collection(path) for _, path in ROUTES if _an_id(caller, path) is None})
    assert missing == []


@pytest.mark.parametrize(("method", "path"), ROUTES)
@given(body=BODIES)
def test_no_request_is_a_server_error(body, method, path, caller):
    _assert_answered(caller, method, path, _an_id(caller, path), body)


# Postgres refuses a NUL byte outright, so every route meets one in every run, in its body and in its lookup.
@pytest.mark.parametrize(("method", "path"), ROUTES)
@pytest.mark.parametrize("where", ["body", "lookup"])
def test_a_nul_byte_is_never_a_server_error(where, method, path, caller):
    pk = _an_id(caller, path)
    for nul in ["\x00", ["\x00"]]:
        if where == "body":
            _assert_answered(caller, method, path, pk, dict.fromkeys(FIELD_NAMES, nul))
    if where == "lookup":
        _assert_answered(caller, method, path, quote(pk[:4] + "\x00" + pk[4:]), {})


def _assert_answered(caller, method, path, pk, body):
    cache.clear()
    url = path.replace("{pk}", pk)
    with transaction.atomic():
        if method == "get":
            response = caller.get(url, HTTP_HOST=HOST)
        else:
            current = caller.get(_collection(path) + pk + "/", HTTP_HOST=HOST)
            headers = {"If-Match": current["ETag"]} if current.has_header("ETag") else {}
            response = getattr(caller, method)(
                url, data=body, content_type="application/json", headers=headers, HTTP_HOST=HOST
            )
        transaction.set_rollback(True)
    assert response.status_code < 500, f"{method} {url} {body} -> {response.status_code} {response.content[:300]}"
