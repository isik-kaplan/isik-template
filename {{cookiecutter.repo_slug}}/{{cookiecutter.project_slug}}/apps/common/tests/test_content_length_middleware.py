import pytest
from django.http import HttpResponse, StreamingHttpResponse
from django.test import RequestFactory

from apps.common.middleware.content_length import ContentLengthMiddleware


def answering(response):
    return ContentLengthMiddleware(lambda request: response)(RequestFactory().get("/"))


def test_an_answer_that_may_carry_a_body_declares_how_long_it_is():
    assert answering(HttpResponse(b"something"))["Content-Length"] == "9"


@pytest.mark.parametrize("status", [204, 304])
def test_an_answer_that_cannot_carry_a_body_declares_nothing(status):
    assert not answering(HttpResponse(status=status)).has_header("Content-Length")


@pytest.mark.parametrize("status", [204, 304])
def test_a_length_something_below_already_wrote_is_taken_back_off(status):
    answered = HttpResponse(status=status)
    answered["Content-Length"] = "0"

    assert not answering(answered).has_header("Content-Length")


def test_an_answer_still_being_produced_is_left_alone():
    assert not answering(StreamingHttpResponse(iter([b"a", b"b"]))).has_header("Content-Length")


def test_a_length_the_answer_declared_itself_is_kept():
    answered = HttpResponse(b"something")
    answered["Content-Length"] = "4"

    assert answering(answered)["Content-Length"] == "4"


@pytest.mark.django_db
def test_an_answer_made_above_common_middleware_still_declares_its_length(client):
    """The health check answers before CommonMiddleware could measure it."""
    assert client.get("/health/")["Content-Length"] == "2"


def test_it_has_the_last_word_on_every_answer(settings):
    """Below CommonMiddleware it would never take back the zero Common writes on a 204."""
    assert settings.MIDDLEWARE[0] == "apps.common.middleware.content_length.ContentLengthMiddleware"
