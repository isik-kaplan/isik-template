"""What a refusal says about itself, beyond the status it arrives with."""

import pytest
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied, ValidationError
from rest_framework.views import APIView

from apps.common.api.exception_handler import exception_handler


CONTEXT = {"view": APIView(), "request": None}


def test_a_one_sentence_refusal_carries_its_code_beside_its_detail():
    response = exception_handler(PermissionDenied("Not for you.", code="setup_required"), CONTEXT)

    assert response.data == {"detail": "Not for you.", "code": "setup_required"}


def test_a_built_in_refusal_carries_its_default_code_and_keeps_its_detail():
    response = exception_handler(NotFound(), CONTEXT)

    assert response.status_code == 404
    assert response.data == {"detail": NotFound.default_detail, "code": NotFound.default_code}


def test_field_validation_is_left_in_the_shape_its_readers_expect():
    response = exception_handler(ValidationError({"name": ["This field may not be blank."]}), CONTEXT)

    assert response.data == {"name": ["This field may not be blank."]}


def test_a_refusal_django_raised_answers_without_inventing_a_code():
    """DRF converts `Http404` inside its own handler, so what reaches here carries no detail to read."""
    response = exception_handler(Http404(), CONTEXT)

    assert response.status_code == 404
    assert response.data == {"detail": NotFound.default_detail}


def test_an_exception_drf_does_not_handle_is_still_not_handled():
    """None is what lets Django answer it as a 500 rather than a refusal dressed up as one."""
    assert exception_handler(ValueError("not an API exception"), CONTEXT) is None


@pytest.mark.django_db
def test_the_handler_is_the_one_a_real_refusal_goes_through(client):
    response = client.get("/v0/users/me/")

    assert response.json()["code"] == NotAuthenticated.default_code


@pytest.mark.django_db
def test_a_refusal_is_written_down_with_its_code(client, logged):
    response = client.get("/v0/users/me/")

    assert response.status_code == 403
    (refused,) = [line for line in logged if line["event"] == "permission.refused"]
    assert refused["permission"] == "not_authenticated"
    assert refused["code"] == "apps.common.api.exception_handler"


def test_a_refusal_django_raised_has_no_code_to_give(logged):
    """Django's own PermissionDenied arrives here before DRF converts it, carrying no `detail`."""
    response = exception_handler(DjangoPermissionDenied(), context={})

    assert response.status_code == 403
    assert [(line["event"], line["permission"]) for line in logged] == [("permission.refused", "")]


def test_the_view_context_reaches_drfs_own_handler(monkeypatch):
    """DRF's handler reads nothing from it today, but anything layered on top of it may."""
    seen = []
    monkeypatch.setattr(
        "apps.common.api.exception_handler.drf_exception_handler", lambda exc, context: seen.append((exc, context))
    )
    exc, context = NotFound(), {"view": object()}

    assert exception_handler(exc, context) is None
    assert seen == [(exc, context)]


def test_an_answer_that_is_not_a_refusal_writes_nothing(logged):
    response = exception_handler(NotFound(), context={})

    assert response.status_code == 404
    assert logged == []


def test_an_exception_drf_does_not_handle_writes_nothing(logged):
    assert exception_handler(ValueError("boom"), context={}) is None
    assert logged == []
