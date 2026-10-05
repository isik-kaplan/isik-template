"""The line nobody writes, and what it is allowed to say about the call.

Asserted against a whole payload rather than a field at a time, because the risk here is a value
that *appears* rather than one that goes missing: a test reading only the keys it expects would pass
for a line carrying a password beside them.
"""

import json
import time

import pytest
from django.conf import settings
from django.db import connection
from django.test import RequestFactory
from django.test.utils import CaptureQueriesContext
from hypothesis import given
from hypothesis import strategies as st

from apps.common.logging.redaction import (
    LOGGABLE,
    REDACTED,
    body_of,
    client_ip_of,
    headers_of,
    query_of,
    values_of,
    worth_logging,
)
from apps.common.logging.scrub import scrub_event
from apps.common.middleware.request_log import RequestLogMiddleware

from {{ cookiecutter.project_slug }}.config import CONFIG


def answered(status=200, **request_kwargs):
    """One request through the middleware, and whatever it answered."""
    request = RequestFactory().generic(**request_kwargs)
    response = type("R", (), {"status_code": status})()
    middleware = RequestLogMiddleware(get_response=lambda _: response)
    assert middleware(request) is response
    return request


class TestWhichRequestsEarnALine:
    def test_a_request_that_worked_is_not_worth_a_line(self):
        """Most of the volume and the least of the information. It is the default, so this is what
        somebody gets without choosing anything."""
        assert CONFIG.LOGGING.REQUESTS == "non-2xx"
        assert worth_logging(200, elapsed_ms=1) is False

    def test_a_refusal_is(self):
        assert worth_logging(403, elapsed_ms=1) is True
        assert worth_logging(500, elapsed_ms=1) is True

    def test_a_slow_one_is_whatever_it_answered(self):
        """The line somebody went looking for is usually a 200 that took too long."""
        assert CONFIG.LOGGING.SLOW_REQUEST_MS == 1000
        assert worth_logging(200, elapsed_ms=1000) is True
        assert worth_logging(200, elapsed_ms=999) is False

    def test_slowness_can_be_turned_off_without_turning_the_line_off(self, monkeypatch):
        monkeypatch.setattr(CONFIG.LOGGING, "SLOW_REQUEST_MS", 0)

        assert worth_logging(200, elapsed_ms=10_000) is False
        assert worth_logging(500, elapsed_ms=1) is True

    def test_the_window_is_2xx_exactly(self):
        """A redirect is not a success, and either edge of that range moved by one puts a whole
        class of answer in the half nobody writes down."""
        assert worth_logging(300, elapsed_ms=1) is True
        assert worth_logging(299, elapsed_ms=1) is False
        assert worth_logging(200, elapsed_ms=1) is False
        assert worth_logging(199, elapsed_ms=1) is True

    def test_as_slow_as_asked_is_slow_enough(self, monkeypatch):
        """At least, not more than: a threshold that only fires past itself answers a different
        question from the one the setting's name asks."""
        monkeypatch.setattr(CONFIG.LOGGING, "SLOW_REQUEST_MS", 1)

        assert worth_logging(200, elapsed_ms=1) is True
        assert worth_logging(200, elapsed_ms=0) is False

    def test_everything_is_written_when_asked(self, monkeypatch):
        monkeypatch.setattr(CONFIG.LOGGING, "REQUESTS", "all")

        assert worth_logging(200, elapsed_ms=0) is True

    def test_nothing_is_written_when_asked(self, monkeypatch):
        monkeypatch.setattr(CONFIG.LOGGING, "REQUESTS", "none")

        assert worth_logging(500, elapsed_ms=10_000) is False


class TestWhatItMaySay:
    def test_a_value_nobody_named_is_never_written(self):
        """The whole rule. A name absent from the allowlist is reported as having been there and
        nothing else - which is what makes a field nobody has thought of yet safe."""
        request = RequestFactory().get("/x/", {"page": "2", "token": "hunter2", "email": "a@b.test"})

        assert query_of(request) == {"page": "2", "token": REDACTED, "email": REDACTED}

    @given(st.dictionaries(st.text(), st.text()))
    def test_no_value_outside_the_allowlist_survives(self, sent):
        """Property: whatever names a caller invents, only an allowlisted one keeps its value."""
        kept = values_of(sent.items())

        assert kept.keys() == sent.keys()
        assert all(kept[name] == (value if name in LOGGABLE else REDACTED) for name, value in sent.items())

    def test_a_password_is_reported_as_having_been_sent_and_no_more(self):
        request = RequestFactory().post(
            "/x/", data=json.dumps({"username": "jane", "password": "hunter2"}), content_type="application/json"
        )

        assert body_of(request) == {"username": REDACTED, "password": REDACTED}

    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH"])
    def test_every_method_that_carries_one_is_read_for_its_shape(self, method):
        """All three write, so all three can carry a password - and a method left out of the list
        is a method whose body is never looked at."""
        request = RequestFactory().generic(
            method, "/x/", data=json.dumps({"token": "hunter2"}), content_type="application/json"
        )

        assert body_of(request) == {"token": REDACTED}

    @pytest.mark.parametrize("method", ["GET", "DELETE", "HEAD"])
    def test_a_method_that_carries_none_reports_none(self, method):
        assert body_of(RequestFactory().generic(method, "/x/", data=b'{"token": "x"}')) is None

    def test_a_write_that_carried_nothing_carried_nothing(self):
        """An empty body is an empty object rather than an unreadable one - "0 bytes nobody could
        parse" reads as a client bug where there was none."""
        assert body_of(RequestFactory().post("/x/", data=b"", content_type="application/json")) == {}

    @pytest.mark.parametrize(
        ("sent", "content_type"),
        [
            (b"\x89PNG\r\n\x1a\n", "image/png"),
            (b"[1, 2, 3]", "application/json"),
            (b"{", "application/json"),
            (b"\xff\xfe", "application/json"),
        ],
        ids=["an upload", "a list rather than an object", "malformed", "not text"],
    )
    def test_anything_not_an_object_is_reported_by_size_alone(self, sent, content_type):
        """An upload's content is never a log line, and neither is a body this cannot read - saying
        how much arrived is the most that can be said without saying what."""
        request = RequestFactory().post("/x/", data=sent, content_type=content_type)

        assert body_of(request) == {"unparsed_bytes": len(sent)}

    def test_the_three_headers_worth_stealing_are_not_kept(self):
        """`Authorization`, `Cookie` and `X-CSRFToken` are the highest-value secrets in a request
        and none of them is in the body, so a body-only rule would miss all three."""
        request = RequestFactory().get(
            "/x/",
            headers={
                "authorization": "Bearer supersecret",
                "cookie": "sessionid=abc",
                "x-csrftoken": "a-token",
                "user-agent": "curl/8.7.1",
                "Accept-Language": "tr",
            },
        )

        assert headers_of(request) == {"User-Agent": "curl/8.7.1", "Accept-Language": "tr"}


class TestWhoseAddress:
    def test_it_is_the_one_nginx_saw(self):
        """`X-Real-IP` is overwritten on every proxy pass, so it is nginx's word rather than the
        caller's - which `X-Forwarded-For`, appended to, is not."""
        request = RequestFactory().get("/x/", headers={"x-real-ip": "203.0.113.44"})

        assert client_ip_of(request) == "203.0.113.44"

    def test_an_address_nobody_recorded_is_empty_rather_than_missing(self):
        request = RequestFactory().get("/x/")
        del request.META["REMOTE_ADDR"]

        assert client_ip_of(request) == ""

    def test_a_caller_cannot_claim_one_by_sending_the_header_itself(self):
        """Not a property of this function - nginx replaces it - but pinned so a change to reading
        `X-Forwarded-For` instead has to argue with this test first."""
        request = RequestFactory().get("/x/", headers={"x-forwarded-for": "1.2.3.4"})
        request.META["REMOTE_ADDR"] = "172.20.0.1"

        assert client_ip_of(request) == "172.20.0.1"


@pytest.mark.django_db
def test_the_line_carries_the_shape_of_the_call(logged, monkeypatch):
    ticks = iter([10.0, 12.0])
    monkeypatch.setattr(time, "monotonic", lambda: next(ticks))

    answered(
        status=404,
        method="GET",
        path="/x/",
        data="",
        QUERY_STRING="page=2&token=hunter2",
        headers={"user-agent": "curl/8.7.1", "authorization": "Bearer secret"},
    )

    assert logged == [
        {
            "event": "request",
            "code": "apps.common.middleware.request_log",
            "method": "GET",
            "path": "/x/",
            "status": 404,
            # A clock, not a scale: the unit is in the field's name.
            "duration_ms": 2000,
            "db_queries": 0,
            "client_ip": "127.0.0.1",
            "query": {"page": "2", "token": REDACTED},
            # A read leaves the body off the line rather than naming it empty.
            "body": None,
            "headers": {"User-Agent": "curl/8.7.1"},
        }
    ]


@pytest.mark.django_db
def test_the_line_carries_what_a_write_sent_and_who_sent_it(logged):
    answered(
        status=400,
        method="POST",
        path="/x/",
        data=json.dumps({"page": "2", "password": "hunter2"}),
        content_type="application/json",
        headers={"x-real-ip": "203.0.113.44"},
    )

    (written,) = logged
    assert written["body"] == {"page": "2", "password": REDACTED}
    assert written["client_ip"] == "203.0.113.44"
    assert written["query"] is None


@pytest.mark.django_db
def test_an_empty_write_leaves_the_body_off_the_line(logged):
    answered(status=400, method="POST", path="/x/", data=b"", content_type="application/json")

    assert logged[0]["body"] is None


@pytest.mark.django_db
def test_the_line_counts_the_requests_own_queries_and_nobody_elses(logged):
    """What the request did, not what the process had done before it: a count read as a total is
    the number that makes every later request look worse than the one before."""

    def two_queries(_):
        connection.cursor().execute("SELECT 1")
        connection.cursor().execute("SELECT 2")
        return type("R", (), {"status_code": 500})()

    with CaptureQueriesContext(connection):
        connection.cursor().execute("SELECT 0")
        RequestLogMiddleware(get_response=two_queries)(RequestFactory().get("/x/"))

    assert logged[0]["db_queries"] == 2


@pytest.mark.django_db
def test_a_request_that_worked_writes_nothing(logged):
    answered(status=200, method="GET", path="/x/", data="")

    assert logged == []


@pytest.mark.django_db
def test_the_middleware_reads_the_context_history_opened(client, logged):
    """Installed below HistoryContextMiddleware, so a refused write already names the request it
    was part of."""
    client.post("/v0/users/", {"username": "bob"})

    (line,) = [line for line in logged if line["event"] == "request"]
    assert line["url"] == "/v0/users/"
    assert "pgh_context" in line
    middleware = settings.MIDDLEWARE
    assert middleware.index("apps.common.middleware.request_log.RequestLogMiddleware") == (
        middleware.index("apps.common.middleware.history_context.HistoryContextMiddleware") + 1
    )


class TestSentryKeepsTheSameRule:
    def test_a_body_it_captured_is_narrowed_the_same_way(self):
        event = scrub_event({"request": {"data": {"page": "2", "password": "hunter2"}}}, hint=None)

        assert event == {"request": {"data": {"page": "2", "password": REDACTED}}}

    def test_a_body_it_could_not_parse_is_left_as_sentry_already_cut_it(self):
        """Sentry sends an unparsed body as a size marker string, which has no names to allow."""
        event = scrub_event({"request": {"data": "[Filtered]"}}, hint=None)

        assert event == {"request": {"data": "[Filtered]"}}

    def test_cookies_go_entirely_rather_than_by_name(self):
        """Which cookies somebody holds is not worth the one that lets you become them."""
        event = scrub_event({"request": {"cookies": {"sessionid": "abc"}}}, hint=None)

        assert event == {"request": {"cookies": REDACTED}}

    def test_no_cookies_are_left_as_none_rather_than_invented(self):
        assert scrub_event({"request": {"cookies": {}}}, hint=None) == {"request": {"cookies": {}}}

    def test_headers_are_allowlisted_there_too(self):
        event = scrub_event(
            {"request": {"headers": {"Authorization": "Bearer secret", "User-Agent": "curl"}}}, hint=None
        )

        assert event == {"request": {"headers": {"User-Agent": "curl"}}}

    def test_headers_sentry_did_not_send_as_a_mapping_are_left_alone(self):
        assert scrub_event({"request": {"headers": None}}, hint=None) == {"request": {"headers": None}}

    def test_an_event_about_nothing_in_particular_is_left_alone(self):
        """Not every exception has a request behind it - a task's does not."""
        assert scrub_event({"exception": {"values": []}}, hint=None) == {"exception": {"values": []}}
        assert scrub_event({"request": {}}, hint=None) == {"request": {}}
