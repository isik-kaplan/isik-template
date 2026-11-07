"""No id a caller can put in a detail route is answered with a server error.

The half of every detail route where the lookup fails: an id that names nothing, one of the wrong
type, one too long for its column. A real row's half needs rows of its own.
"""

import uuid

import pytest
from django.conf import settings
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st

from properties.rest.surface import detail_operations


pytestmark = pytest.mark.django_db

HOST = f"api.{settings.PARENT_HOST}"
METHODS = ("get", "put", "patch", "delete", "post")
ROUTES = sorted({(method, path) for method in METHODS for path in detail_operations("api", method)})

IDS = st.one_of(
    st.uuids().map(str),
    st.integers(min_value=-(10**20), max_value=10**20).map(str),
    st.sampled_from(["me", "null", "0", "true", "%00", "..", "a" * 300, str(uuid.UUID(int=0))]),
    st.text(st.characters(min_codepoint=48, max_codepoint=122), min_size=1, max_size=40),
)


def test_the_sweep_found_detail_routes_for_every_method():
    assert {method for method, _ in ROUTES} == set(METHODS)
    assert ("get", "/v0/users/{pk}/") in ROUTES


@pytest.mark.parametrize(("method", "path"), ROUTES)
@given(pk=IDS)
def test_no_id_is_a_server_error(pk, method, path, caller):
    url = path.replace("{pk}", pk)
    with transaction.atomic():
        if method == "get":
            response = caller.get(url, HTTP_HOST=HOST)
        else:
            response = getattr(caller, method)(url, data={}, content_type="application/json", HTTP_HOST=HOST)
        transaction.set_rollback(True)
    assert response.status_code < 500, f"{method} {url} -> {response.status_code} {response.content[:300]}"
