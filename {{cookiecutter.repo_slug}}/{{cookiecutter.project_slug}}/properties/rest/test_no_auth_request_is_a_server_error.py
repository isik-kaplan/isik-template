"""No request to the auth host is answered with a server error: allauth's headless API, the OAuth
provider's endpoints and the API document, as somebody signed in and as a stranger."""

import pytest
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st

from properties.rest.surface import operations


pytestmark = pytest.mark.django_db

HOST = f"auth.{settings.PARENT_HOST}"
READABLE = operations("auth", "get")
WRITABLE = operations("auth", "post")

WORD = st.text(st.characters(min_codepoint=33, max_codepoint=126, exclude_characters="&=#%+"), max_size=16)
QUERIES = st.dictionaries(
    st.sampled_from(["next", "client_id", "redirect_uri", "scope", "response_type", "state", "key", "code"])
    | WORD.filter(bool),
    st.sampled_from(["", "0", "openid", "code", "https://evil.example.test/"]) | WORD,
    max_size=4,
)
SCALARS = (
    st.none()
    | st.booleans()
    | st.integers(-(10**6), 10**6)
    | st.text(max_size=24)
    | st.lists(st.text(max_size=8), max_size=2)
)
BODIES = st.dictionaries(
    st.sampled_from(["email", "password", "username", "code", "key", "provider", "process", "callback_url", "token"])
    | st.text(min_size=1, max_size=12),
    SCALARS,
    max_size=4,
)


def test_the_sweep_found_the_auth_host():
    assert "/v0/browser/auth/login" in WRITABLE
    assert "/o/authorize/" in READABLE


@pytest.mark.parametrize("path", READABLE)
@given(query=QUERIES)
def test_no_query_is_a_server_error(query, path, caller):
    cache.clear()
    with transaction.atomic():
        response = caller.get(path, data=query, HTTP_HOST=HOST)
        transaction.set_rollback(True)
    assert response.status_code < 500, f"{path} {query} -> {response.status_code} {response.content[:300]}"


@pytest.mark.parametrize("path", WRITABLE)
@given(body=BODIES)
def test_no_body_is_a_server_error(body, path, caller):
    cache.clear()
    with transaction.atomic():
        response = caller.post(path, data=body, content_type="application/json", HTTP_HOST=HOST)
        transaction.set_rollback(True)
    assert response.status_code < 500, f"{path} {body} -> {response.status_code} {response.content[:300]}"
