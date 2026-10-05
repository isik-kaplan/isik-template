"""The renderer encodes what DRF actually hands it, error bodies included.

msgspec encodes exact types, and `ErrorDetail` is a `str` subclass - so the library's own renderer
turns every 401, 403 and validation error into a 500. Tested on the encoder directly, since the error
paths are the half a green suite is least likely to exercise through it.
"""

import msgspec
import pytest
from django.utils.functional import lazy
from django.utils.safestring import mark_safe
from rest_framework.exceptions import ErrorDetail, NotAuthenticated
from rest_framework.renderers import JSONRenderer as DrfJSONRenderer

from apps.common.api.renderers import JSONRenderer


def render(data):
    return JSONRenderer().render(data)


def test_an_error_body_encodes_as_the_string_it_reads_as():
    detail = ErrorDetail("Authentication credentials were not provided.", code="not_authenticated")

    assert render({"detail": detail}) == b'{"detail":"Authentication credentials were not provided."}'


def test_a_lazy_translation_still_reaches_the_library_hook():
    assert render({"label": lazy(lambda: "User", str)()}) == b'{"label":"User"}'


def test_safe_markup_encodes_as_its_own_text():
    assert render({"mark": mark_safe("<b>")}) == b'{"mark":"<b>"}'


def test_something_genuinely_unencodable_still_raises():
    with pytest.raises(TypeError):
        render({"when": object()})


def test_the_ordinary_payload_is_byte_identical_to_the_one_drf_would_have_written():
    """The swap is a speedup, not a format change - anything else moves the typed clients."""
    payload = {"count": 2, "next": None, "results": [{"id": 1, "name": "alice"}, {"id": 2, "name": "bob"}]}

    assert render(payload) == DrfJSONRenderer().render(payload)


def test_none_renders_as_an_empty_body():
    """A 204 carries no JSON `null`, which is the library's behavior and DRF's before it."""
    assert render(None) == b""


def test_the_encoder_is_msgspec_rather_than_the_standard_library():
    assert msgspec.json.encode({"a": 1}) == render({"a": 1})


@pytest.mark.django_db
def test_a_refusal_served_over_http_is_a_refusal_rather_than_a_crash(client):
    """The end to end half: every 401/403 body goes through this renderer."""
    response = client.get("/v0/users/me/")

    assert response.status_code == 403
    assert response.json() == {"detail": NotAuthenticated.default_detail, "code": NotAuthenticated.default_code}


@pytest.mark.django_db
def test_a_session_survives_the_msgspec_serializer(client, django_user_model):
    """SESSION_SERIALIZER is msgspec's too, so a login that could not be written back would sign
    nobody in."""
    user = django_user_model.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    assert client.get("/v0/users/me/").json()["username"] == "alice"
