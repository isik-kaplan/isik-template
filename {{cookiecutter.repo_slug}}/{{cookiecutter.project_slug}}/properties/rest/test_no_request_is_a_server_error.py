"""No request to the API is answered with a server error.

A 400, 403 or 404 is the API doing its job; a 5xx is the one answer no input should produce. The
paths come from the resolver, so an endpoint added later is swept without anybody listing it. They
are parametrized rather than drawn, or 25 examples would reach a different part of the API each run.
"""

import pytest
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st

from properties.rest.surface import operations


pytestmark = pytest.mark.django_db

HOST = f"api.{settings.PARENT_HOST}"
READABLE = operations("api", "get")
WRITABLE = sorted(set(operations("api", "post")) | set(operations("api", "patch")))

# The shapes that have broken query parsing elsewhere: empty, not a number, a number too big for one.
# Whitespace and NUL are facts about HTTP, not about this API.
WORD = st.text(st.characters(min_codepoint=33, max_codepoint=126, exclude_characters="&=#%+"), max_size=16)
QUERIES = st.dictionaries(
    WORD.filter(bool),
    st.sampled_from(["", "0", "-1", "99999999999999999999", "true", "null", "[]", "{}", "NaN"]) | WORD,
    max_size=4,
)
# Legal JSON of the wrong shape: a null where a string goes, a list where a scalar does.
SCALARS = (
    st.none()
    | st.booleans()
    | st.integers(min_value=-(10**12), max_value=10**12)
    | st.text(max_size=24)
    | st.lists(st.text(max_size=8), max_size=3)
)
BODIES = st.dictionaries(st.text(min_size=1, max_size=16), SCALARS, max_size=5)


def _answer(send):
    cache.clear()
    # Each example in its own savepoint: one refused insert would abort every example after it.
    with transaction.atomic():
        response = send()
        transaction.set_rollback(True)
    return response


def test_the_sweep_found_the_api():
    assert "/v0/users/" in READABLE
    assert "/v0/personal-access-tokens/" in WRITABLE


@pytest.mark.parametrize("path", READABLE)
@given(query=QUERIES)
def test_no_query_is_a_server_error(query, path, caller):
    response = _answer(lambda: caller.get(path, data=query, HTTP_HOST=HOST))
    assert response.status_code < 500, f"{path} {query} -> {response.status_code} {response.content[:300]}"


@pytest.mark.parametrize("path", WRITABLE)
@given(body=BODIES)
def test_no_body_is_a_server_error(body, path, caller):
    response = _answer(lambda: caller.post(path, data=body, content_type="application/json", HTTP_HOST=HOST))
    assert response.status_code < 500, f"{path} {body} -> {response.status_code} {response.content[:300]}"
