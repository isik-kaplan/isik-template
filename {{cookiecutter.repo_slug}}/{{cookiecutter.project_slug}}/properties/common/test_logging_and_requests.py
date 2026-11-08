"""What a log line, a Sentry event and a response may carry, over whatever a request or record holds."""

import ipaddress
import json
import logging
import sys

import pghistory
import pytest
from django.http import HttpResponse, StreamingHttpResponse
from django.test import RequestFactory
from django.utils.translation import gettext_lazy
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.common.middleware.history import REQUEST_ID_HEADER

from apps.common.api.renderers import enc_hook
from apps.common.api.throttling import AnonymousRateThrottle
from apps.common.logging import REQUEST, log
from apps.common.logging.emit import audit
from apps.common.logging.events import DECLARED, PAYLOAD, Event
from apps.common.logging.formatters import ConsoleFormatter, JSONFormatter
from apps.common.logging.redaction import LOGGABLE, LOGGABLE_HEADERS, REDACTED, body_of, size_of, worth_logging
from apps.common.logging.scrub import scrub_event
from apps.common.middleware.content_length import ContentLengthMiddleware
from apps.common.middleware.health_check import HealthCheckMiddleware
from apps.common.middleware.request_log import RequestLogMiddleware

from {{ cookiecutter.project_slug }}.config import CONFIG


KEY = st.sampled_from([*sorted(LOGGABLE), "password", "email", "token"])
VALUE = st.text(max_size=8)
PAIRS = st.dictionaries(KEY, VALUE, max_size=5)


def _redacted(pairs):
    return {name: (value if name in LOGGABLE else REDACTED) for name, value in pairs.items()}


def _record(message, args, failed):
    exc_info = None
    if failed:
        try:
            raise RuntimeError(message)
        except RuntimeError:
            exc_info = sys.exc_info()
    return logging.LogRecord("some.library", logging.WARNING, __file__, 1, message, args, exc_info)


@pytest.mark.parametrize("failed", [False, True])
@pytest.mark.parametrize("ours", [False, True])
@given(message=st.text(st.characters(codec="ascii", categories=["L", "N"]), max_size=20))
def test_a_record_shows_its_event_message_and_exception_in_both_renderings(failed, ours, message):
    record = _record(message, (), failed)
    if ours:
        setattr(record, PAYLOAD, {"event": "ours", "note": message})

    as_json = json.loads(JSONFormatter().format(record))
    console = ConsoleFormatter().format(record)

    if ours:
        assert (as_json["event"], as_json.get("note"), "message" in as_json) == ("ours", message, False)
        assert ("RuntimeError" in console) is failed
        return
    assert (as_json["event"], as_json["logger"], as_json["message"]) == ("some.library", "some.library", message)
    assert ("exception" in as_json) is failed
    assert console.split("\n")[0].endswith(f"  {message}")
    assert ("RuntimeError" in console) is failed


@pytest.mark.django_db
@pytest.mark.parametrize("request_id", [None, "01JB4F"])
@given(
    data=PAIRS,
    query=st.lists(st.tuples(KEY, VALUE), max_size=4),
    cookies=st.dictionaries(st.text(min_size=1, max_size=5), VALUE, max_size=2),
    headers=st.dictionaries(st.sampled_from([*sorted(LOGGABLE_HEADERS), "Authorization", "Cookie"]), VALUE),
)
def test_a_sentry_event_keeps_only_what_the_access_log_may_say(request_id, data, query, cookies, headers):
    query_string = "&".join(f"{name}={value}" for name, value in query if "&" not in value and "=" not in value)
    event = {"request": {"data": data, "cookies": cookies, "headers": headers}}
    # Sentry leaves the query string out when there is none.
    if query:
        event["request"]["query_string"] = query_string

    with pghistory.context(request_id=request_id):
        scrubbed = scrub_event(event, hint=None)

    request = scrubbed["request"]
    assert request["data"] == _redacted(data)
    assert all(value in ("", REDACTED) or name in LOGGABLE for name, value in request.get("query_string", {}).items())
    assert request["cookies"] == (REDACTED if cookies else cookies)
    assert set(request["headers"]) <= {name for name in headers if name.lower() in LOGGABLE_HEADERS}
    assert scrubbed.get("tags", {}).get("request_id") == request_id


@given(event=st.dictionaries(st.sampled_from(["level", "message"]), VALUE))
def test_an_event_without_a_request_passes_through(event):
    assert scrub_event(dict(event), hint=None) == event


BODIES = st.one_of(
    PAIRS.map(json.dumps),
    st.lists(VALUE, max_size=3).map(json.dumps),
    st.binary(max_size=12).map(lambda raw: b"\xff" + raw),
    st.just(b""),
)


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "GET", "DELETE"])
@pytest.mark.parametrize("content_type", ["application/json", "text/plain"])
@given(body=BODIES)
def test_a_body_is_logged_by_key_only_when_it_is_a_json_object(method, content_type, body):
    raw = body.encode() if isinstance(body, str) else body
    request = RequestFactory().generic(method, "/", raw, content_type=content_type)

    logged = body_of(request)

    if method not in ("POST", "PUT", "PATCH"):
        assert logged is None
    elif not raw:
        assert logged == {}
    elif content_type == "application/json" and isinstance(parsed := _parsed(raw), dict):
        assert logged == _redacted(parsed)
    else:
        assert logged == {"unparsed_bytes": len(raw)}


def _parsed(raw):
    try:
        return json.loads(raw)
    except ValueError:
        return None


@given(length=st.text(max_size=6))
def test_an_unreadable_length_counts_as_none(length):
    request = RequestFactory().generic("POST", "/", b"")
    request.META["CONTENT_LENGTH"] = length
    try:
        expected = int(length or 0)
    except ValueError:
        expected = 0

    assert size_of(request) == expected


@pytest.mark.parametrize("asked", ["none", "all"])
@given(status=st.integers(100, 599), elapsed=st.integers(0, 100_000))
def test_none_and_all_ignore_the_status_and_the_time(monkeypatch, asked, status, elapsed):
    with monkeypatch.context() as patched:
        patched.setitem(CONFIG.LOGGING, "REQUESTS", asked)
        assert worth_logging(status, elapsed) is (asked == "all")


UNDECLARED = st.from_regex(r"[a-z]{3,10}\.[a-z]{3,10}", fullmatch=True)


@pytest.mark.parametrize("writer", [log, audit])
@given(name=UNDECLARED)
def test_an_event_nobody_declared_is_refused(writer, name):
    with pytest.raises(ValueError, match="is not a declared event|audited"):
        writer(Event(name=name, severity=logging.INFO))


@given(note=st.none() | st.text(max_size=10), fields=st.dictionaries(st.sampled_from(["method", "path"]), VALUE))
def test_a_line_names_its_required_fields_and_carries_its_note(logged, note, fields):
    logged.clear()
    if {"method", "path", "status", "duration_ms"} - {*fields, "status", "duration_ms"}:
        with pytest.raises(TypeError, match="needs"):
            log(REQUEST, note=note, status=200, duration_ms=1, **fields)
        return
    log(REQUEST, note=note, status=200, duration_ms=1, **fields)
    (line,) = logged
    assert line.get("note") == note


@given(event=st.sampled_from(sorted(DECLARED)))
def test_each_event_is_written_only_through_its_own_writer(event):
    declared = DECLARED[event]
    wrong = log if declared.audited else audit
    with pytest.raises(ValueError):
        wrong(declared, **dict.fromkeys(declared.requires, "x"))


@given(address=st.ip_addresses(v=6))
def test_every_address_in_one_ipv6_64_is_throttled_as_one(address):
    request = RequestFactory().get("/", REMOTE_ADDR=str(address))
    sibling = RequestFactory().get("/", REMOTE_ADDR=str(address.exploded[:19] + ":ffff:ffff:ffff:ffff"))

    ident = AnonymousRateThrottle().get_ident(request)

    assert ident == AnonymousRateThrottle().get_ident(sibling)
    assert ipaddress.ip_address(ident) in ipaddress.IPv6Network(f"{ident}/64")


@given(value=st.text() | st.text().map(gettext_lazy))
def test_a_string_is_encoded_as_a_plain_copy_and_anything_else_by_the_django_hook(value):
    encoded = enc_hook(value)

    assert type(encoded) is str
    assert encoded == str(value)


@pytest.mark.parametrize("status", [204, 304, 200])
@pytest.mark.parametrize("streaming", [False, True])
@given(body=st.binary(max_size=20))
def test_a_bodiless_status_carries_no_length_and_every_other_whole_body_its_own(status, streaming, body):
    response = StreamingHttpResponse([body], status=status) if streaming else HttpResponse(body, status=status)
    response["Content-Length"] = "999"
    if status == 200:
        del response["Content-Length"]

    answered = ContentLengthMiddleware(get_response=lambda request: response)(RequestFactory().get("/"))

    if status in (204, 304):
        assert not answered.has_header("Content-Length")
    elif streaming:
        assert not answered.has_header("Content-Length")
    else:
        assert answered["Content-Length"] == str(len(body))


@given(path=st.sampled_from(["/health/", "/health", "/healthz/"]))
def test_the_health_check_answers_its_exact_path_and_nothing_else(path):
    passed = HttpResponse("passed through")
    response = HealthCheckMiddleware(get_response=lambda request: passed)(RequestFactory().get(path))

    assert (response.content == b"ok") is (path == "/health/")


@pytest.mark.django_db
@pytest.mark.parametrize("request_id", [None, "01JB4F"])
@given(status=st.integers(200, 599))
def test_the_request_id_is_handed_back_only_when_there_is_one(request_id, status):
    response = HttpResponse(status=status)
    middleware = RequestLogMiddleware(get_response=lambda request: response)

    if request_id:
        with pghistory.context(request_id=request_id):
            answered = middleware(RequestFactory().get("/"))
    else:
        answered = middleware(RequestFactory().get("/"))

    assert answered.get(REQUEST_ID_HEADER) == request_id


@given(remote=st.from_regex(r"[a-z]{1,10}", fullmatch=True))
def test_an_address_that_is_no_ip_is_throttled_under_its_own_name(remote):
    assert AnonymousRateThrottle().get_ident(RequestFactory().get("/", REMOTE_ADDR=remote)) == remote
