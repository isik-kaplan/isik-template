"""Registering a webhook endpoint stops at the limit staff set, whatever the limit and the URL."""

import time

import pytest
from django.core.cache import cache
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.features.operations import force_setting, grant

from apps.common.links import api_path
from apps.features.declarations import STAFF, WEBHOOKS
from apps.notifications.models import Endpoint
from apps.users.tests import conftest as users
from conftest import give_authentication_records


alice = users.alice

pytestmark = pytest.mark.django_db

ENDPOINTS = api_path("notifications:endpoints-list")
HOSTS = st.text(st.sampled_from("abcdefghijklmnopqrstuvwxyz"), min_size=1, max_size=10)


@pytest.mark.parametrize("full", [False, True], ids=["room", "full"])
@given(limit=st.integers(min_value=1, max_value=3), host=HOSTS, data=st.data())
def test_an_endpoint_is_registered_only_below_the_owners_limit(client, alice, full, limit, host, data):
    with transaction.atomic():
        cache.clear()
        client.force_login(alice)
        session = client.session
        give_authentication_records(
            session, alice, [{"method": "socialaccount", "at": time.time(), "reauthenticated": True}]
        )
        session.save()
        grant(alice, WEBHOOKS, source="staff")
        force_setting(
            alice, "max_endpoints", limit, source=STAFF, reason="A limit drawn by a property, to count against."
        )
        existing = limit if full else data.draw(st.integers(min_value=0, max_value=limit - 1))
        for n in range(existing):
            Endpoint.objects.create(url=f"https://earlier-{n}.example.test/", secret="s3cret", owner=alice)

        response = client.post(ENDPOINTS, {"url": f"https://{host}.example.test/"}, content_type="application/json")

        if full:
            assert response.status_code == 409, response.content
            assert response.json()["code"] == "endpoint_limit_reached"
        else:
            assert response.status_code == 201, response.content
        assert Endpoint.objects.filter(owner=alice).count() == existing + (0 if full else 1)
        transaction.set_rollback(True)
