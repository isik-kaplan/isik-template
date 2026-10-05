"""The log call, what it refuses, and the two renderings of what it writes.

The point of the mechanism is that a call site carries no context and cannot forget any: everything
about who and where is read from the context pghistory already opened.
"""

import json
import logging
import sys
import time
import uuid

import pghistory
import pytest
from django.conf import settings
from hypothesis import assume, given
from hypothesis import strategies as st

from apps.common.logging import DECLARED, REQUEST, Event, ambient, audit, declare, emit, log
from apps.common.logging.emit import AUDIT_LOGGER, LOGGER
from apps.common.logging.events import NAME_SHAPE, PAYLOAD
from apps.common.logging.formatters import ConsoleFormatter, JSONFormatter


@pytest.fixture
def an_event():
    """Declared for one test and taken back out: the registry is module state, and a name left
    behind would collide with the next test to want it."""
    event = declare("test.happened", logging.INFO, ("what",))
    yield event
    del DECLARED[event.name]


@pytest.fixture
def an_audited_event():
    event = declare("test.moved", logging.WARNING, ("to_user",), audited=True)
    yield event
    del DECLARED[event.name]


def a_record(**payload):
    record = logging.LogRecord(LOGGER.name, logging.INFO, __file__, 1, "test.happened", None, None)
    record.msecs = 25
    setattr(record, PAYLOAD, payload)
    return record


class TestTheVocabulary:
    def test_an_event_declared_twice_is_refused(self):
        """The name is how a line is searched for, so two events answering to one name is two
        different things in one query and no way to tell them apart."""
        with pytest.raises(ValueError, match="declared twice"):
            declare(REQUEST.name, logging.INFO)

    @pytest.mark.parametrize(
        "name", ["Login.failed", "login..failed", "login.", ".login", "login failed", "1login"], ids=repr
    )
    def test_a_name_shaped_unlike_the_others_is_refused(self, name):
        with pytest.raises(ValueError, match="dotted lowercase"):
            declare(name, logging.INFO)
        assert name not in DECLARED

    def test_declaring_records_what_was_declared(self):
        event = declare("test.declared", logging.WARNING, ["who"], audited=True)
        try:
            assert DECLARED["test.declared"] is event
            assert event == Event(name="test.declared", severity=logging.WARNING, requires=("who",), audited=True)
        finally:
            del DECLARED[event.name]

    def test_an_event_is_not_audited_unless_declared_so(self):
        assert REQUEST.audited is False
        assert Event("anything", logging.INFO).requires == ()

    @given(st.from_regex(NAME_SHAPE, fullmatch=True))
    def test_every_declared_name_is_one_a_query_can_be_saved_against(self, name):
        """Property: whatever `declare` accepts, it accepts exactly once."""
        assume(name not in DECLARED)
        declare(name, logging.INFO)
        try:
            with pytest.raises(ValueError, match="declared twice"):
                declare(name, logging.INFO)
        finally:
            del DECLARED[name]

    def test_every_event_the_project_declares_is_shaped_alike(self):
        assert all(NAME_SHAPE.fullmatch(name) for name in DECLARED)


class TestTheCall:
    def test_an_event_nobody_declared_cannot_be_logged(self):
        """What closes the vocabulary. An `Event` is an ordinary object, so refusing one the
        registry does not hold is the difference between a reviewed list and a suggestion."""
        with pytest.raises(ValueError, match="not a declared event"):
            log(Event("invented.elsewhere", logging.INFO))

    def test_a_copy_of_a_declared_event_is_not_the_declared_event(self, an_event):
        with pytest.raises(ValueError, match="not a declared event"):
            log(Event("test.happened", logging.INFO, ("what",)), what="a thing")

    def test_a_field_the_event_declared_is_required(self, an_event):
        """The whole of the mechanism: the twentieth call site is written by somebody who has read
        none of the previous nineteen, and a line missing the one field that identifies it is noise."""
        with pytest.raises(TypeError, match=r"^'test.happened' needs what\.$"):
            log(an_event)

    def test_every_field_an_event_is_missing_is_named_in_one_sentence(self):
        two_required = declare("test.needs.two", logging.INFO, ("what", "why"))
        try:
            with pytest.raises(TypeError, match=r"needs what, why\."):
                log(two_required)
            with pytest.raises(TypeError, match=r"needs why\."):
                log(two_required, what="a thing")
        finally:
            del DECLARED[two_required.name]

    def test_the_record_is_named_for_the_event_at_its_declared_severity(self, caplog):
        """A handler nobody configured here renders `record.msg`, so an event that stopped naming
        itself is a line that reads as `None` wherever this is not our own formatter."""
        event = declare("test.warned", logging.WARNING)
        try:
            with caplog.at_level(logging.INFO, logger=LOGGER.name):
                log(event)
        finally:
            del DECLARED[event.name]

        (record,) = caplog.records
        assert (record.name, record.levelno, record.getMessage()) == (LOGGER.name, logging.WARNING, "test.warned")

    def test_what_a_line_carries_without_anybody_passing_it(self, an_event, logged):
        """A call site names the event and its own fields. Who and which request come from the
        context pghistory opened, so they cannot be forgotten and cannot be wrong."""
        with pghistory.context(user="01a0e9", request_id="01JB4F") as opened:
            log(an_event, what="a thing")

        assert logged == [
            {
                "event": "test.happened",
                # Where the call sits, which the event name deliberately does not say.
                "code": __name__,
                "pgh_context": str(opened.id),
                "user": "01a0e9",
                "request_id": "01JB4F",
                "what": "a thing",
            }
        ]

    def test_a_field_passed_wins_over_the_same_field_in_the_context(self, an_event, logged):
        """A login names who just signed in, where the context still names who the request began as."""
        with pghistory.context(user=None):
            log(an_event, what="a thing", user="01a0e9")

        assert logged[0]["user"] == "01a0e9"

    def test_a_note_rides_along_and_nothing_else_needs_it(self, an_event, logged):
        log(an_event, what="a thing", note="for a person to read")

        assert logged == [
            {"event": "test.happened", "code": __name__, "what": "a thing", "note": "for a person to read"}
        ]

    def test_a_line_outside_any_context_still_gets_written(self, an_event, logged):
        """A management command, a check, a shell. Having no request is a fact about the line
        rather than a reason to refuse it."""
        log(an_event, what="a thing")

        assert logged == [{"event": "test.happened", "code": __name__, "what": "a thing"}]


class TestTheCaller:
    def test_asked_directly_the_caller_is_whoever_asked(self):
        assert emit._caller() == __name__

    def test_a_wrapper_around_the_call_is_not_the_caller(self, an_event, logged):
        """Mutation testing wraps every function in the tree, so the frame above `log` is a
        trampoline and every line in the suite would say the code lives in mutmut."""
        wrapper = "def wrapped(log, event):\n    log(event, what='a thing')\n"
        through_a_wrapper = {"__name__": "mutmut.mutation.trampoline"}
        exec(compile(wrapper, "<trampoline>", "exec"), through_a_wrapper)

        through_a_wrapper["wrapped"](log, an_event)

        assert logged[0]["code"] == __name__

    def test_a_module_merely_named_like_mutmut_is_still_a_caller(self, an_event, logged):
        wrapper = "def wrapped(log, event):\n    log(event, what='a thing')\n"
        lookalike = {"__name__": "mutmutish"}
        exec(compile(wrapper, "<lookalike>", "exec"), lookalike)

        lookalike["wrapped"](log, an_event)

        assert logged[0]["code"] == "mutmutish"

    def test_the_walk_up_the_stack_ends(self, monkeypatch):
        """Every frame being a wrapper cannot happen under a test runner, which is itself a caller.
        A walk with no end would be a crash where the worst honest answer is an empty field."""

        class Frame:
            f_globals = {"__name__": "mutmut.mutation.trampoline"}
            f_back = None

        monkeypatch.setattr(sys, "_getframe", lambda depth: Frame())

        assert emit._caller() == ""

    def test_a_frame_belonging_to_no_module_is_named_nothing(self, monkeypatch):
        """`exec` of a bare string has globals with no `__name__` at all, and a line attributed to
        whatever stood in for one is worse than a line attributed to nothing."""

        class Frame:
            f_globals = {}
            f_back = None

        monkeypatch.setattr(sys, "_getframe", lambda depth: Frame())

        assert emit._caller() == ""

    def test_the_walk_starts_above_itself(self, monkeypatch):
        asked = []
        real = sys._getframe
        monkeypatch.setattr(sys, "_getframe", lambda depth: asked.append(depth) or real(depth + 1))

        emit._caller()

        assert asked == [1]


def test_ambient_reads_the_context_a_worker_opens():
    """Pinned deliberately. A worker opens its own pghistory context rather than going through the
    middleware, so reading the middleware's published copy would empty every task line - this is
    the reader that covers both, and a release that moves it should fail here rather than quietly
    logging tasks with no cause.
    """
    assert ambient() == {}
    with pghistory.context(user="01a0e9", caused_by="request") as opened:
        read = ambient()

    assert read == {"pgh_context": str(opened.id), "user": "01a0e9", "caused_by": "request"}


class TestTheAuditSink:
    def test_an_audited_event_cannot_be_written_with_log(self, an_audited_event):
        """Which sink an event goes to is the event's own property, so neither call can be made
        the wrong way round - the separation is not a habit at the call site."""
        with pytest.raises(ValueError, match=r"^'test.moved' is audited - write it with audit\(\)"):
            log(an_audited_event, to_user="somebody")

    def test_an_ordinary_event_cannot_be_written_with_audit(self, an_event):
        with pytest.raises(ValueError, match=r"^'test.happened' is not audited - write it with log\(\)\.$"):
            audit(an_event, what="something")

    def test_an_audited_line_requires_its_fields_like_any_other(self, an_audited_event):
        with pytest.raises(TypeError, match="to_user"):
            audit(an_audited_event)

    def test_an_audited_line_goes_to_its_own_logger_and_nowhere_else(self, an_audited_event, logged, audited):
        audit(an_audited_event, to_user="somebody", note="why")

        assert audited == [{"event": "test.moved", "code": __name__, "to_user": "somebody", "note": "why"}]
        assert logged == []

    def test_turning_the_main_logger_down_leaves_the_audit_sink_alone(self, an_audited_event, audited):
        """What "cannot be turned down" means, asserted as the incident would see it."""
        level = LOGGER.level
        LOGGER.setLevel(logging.CRITICAL)
        try:
            audit(an_audited_event, to_user="somebody")
        finally:
            LOGGER.setLevel(level)

        assert [line["event"] for line in audited] == ["test.moved"]

    def test_the_audit_logger_is_configured_not_to_pass_its_records_up(self):
        """Asserted against the configuration: what stops an audit record being quietened is that
        it never reaches the main logger's level at all."""
        configured = settings.LOGGING["loggers"][AUDIT_LOGGER.name]
        assert configured == {"level": "INFO", "handlers": ["stdout"], "propagate": False}
        assert AUDIT_LOGGER.propagate is False
        assert settings.LOGGING["loggers"][LOGGER.name] == {"level": "INFO"}


def _drawn_at(record, fmt):
    """The time the line should carry, computed without the formatter that draws it."""
    return time.strftime(fmt, time.localtime(record.created)) + f".{int(record.msecs):03d}"


class TestJSON:
    def test_it_writes_one_object_a_collector_can_read(self):
        """The whole object, because a field that stopped being written empties a column in
        somebody's query rather than failing anything."""
        record = a_record(event="test.happened", user="01a0e9")

        written = json.loads(JSONFormatter().format(record))

        assert written == {
            "ts": _drawn_at(record, "%Y-%m-%dT%H:%M:%S") + "Z",
            "severity": "INFO",
            "event": "test.happened",
            "user": "01a0e9",
        }

    def test_a_value_json_cannot_hold_is_written_as_it_reads(self):
        """A uuid, a datetime, a model - a line carrying one must not be the line that raises."""
        written = json.loads(JSONFormatter().format(a_record(event="test.happened", user=uuid.UUID(int=1))))

        assert written["user"] == "00000000-0000-0000-0000-000000000001"

    def test_a_librarys_line_keeps_the_only_thing_it_carries(self):
        """Django, celery and allauth log prose through their own loggers. Rendering the fields we
        put on a record and dropping the message would lose all of it."""
        record = logging.LogRecord("django.security", logging.WARNING, __file__, 1, "Invalid %s", ("Host",), None)
        record.msecs = 25

        written = json.loads(JSONFormatter().format(record))

        assert written == {
            "ts": _drawn_at(record, "%Y-%m-%dT%H:%M:%S") + "Z",
            "severity": "WARNING",
            "event": "django.security",
            "logger": "django.security",
            "message": "Invalid Host",
        }

    def test_an_exception_is_named_and_described(self):
        try:
            raise ValueError("no good")
        except ValueError:
            record = a_record(event="test.happened")
            record.exc_info = sys.exc_info()

        written = json.loads(JSONFormatter().format(record))

        assert written["exception"] == {"type": "ValueError", "message": "no good"}
        # Ours, so the prose is not added on top of the fields.
        assert "message" not in written


class TestConsole:
    def test_it_leads_with_what_a_reader_reads_first(self):
        """The whole line, spacing included: the order is the claim, and asserting one field at a
        time says nothing about what sits between them."""
        record = a_record(what="a thing", request_id="01JB4F", user="jane", event="test.happened", why="a reason")

        drawn = ConsoleFormatter().format(record)

        assert drawn == (
            f"{_drawn_at(record, '%H:%M:%S')}  INFO   test.happened  jane  01JB4F  what=a thing why=a reason"
        )

    def test_a_line_with_nothing_of_its_own_ends_where_its_fields_do(self):
        """No trailing separator with nothing behind it - the padding is what a reader scans down."""
        record = a_record(event="test.happened", user="jane")

        drawn = ConsoleFormatter().format(record)

        assert drawn == f"{_drawn_at(record, '%H:%M:%S')}  INFO   test.happened  jane"

    def test_a_field_nobody_set_is_left_out_rather_than_drawn_empty(self):
        record = a_record(event="test.happened", user=None, what=None, why="this one")

        drawn = ConsoleFormatter().format(record)

        assert drawn == f"{_drawn_at(record, '%H:%M:%S')}  INFO   test.happened  why=this one"

    def test_a_falsy_field_that_was_set_is_still_drawn(self):
        record = a_record(event="test.happened", user=0, count=0)

        drawn = ConsoleFormatter().format(record)

        assert drawn == f"{_drawn_at(record, '%H:%M:%S')}  INFO   test.happened  0  count=0"

    def test_drawing_a_line_leaves_the_record_as_it_was(self):
        """Both formatters may be attached to one record - a second handler must not find it
        emptied by the first."""
        record = a_record(event="test.happened", user="jane")

        ConsoleFormatter().format(record)

        assert getattr(record, PAYLOAD) == {"event": "test.happened", "user": "jane"}

    def test_a_librarys_line_is_drawn_beside_ours(self):
        record = logging.LogRecord("django.security", logging.WARNING, __file__, 1, "Invalid %s", ("Host",), None)
        record.msecs = 25

        drawn = ConsoleFormatter().format(record)

        assert drawn == (
            f"{_drawn_at(record, '%H:%M:%S')}  WARNING  django.security  logger=django.security  Invalid Host"
        )

    def test_an_exception_keeps_its_traceback(self):
        try:
            raise ValueError("no good")
        except ValueError:
            record = a_record(event="test.happened")
            record.exc_info = sys.exc_info()

        drawn = ConsoleFormatter().format(record)

        head, newline, trace = drawn.partition("\n")
        # The line it happened on is still there, with the traceback under it rather than instead.
        assert head == f"{_drawn_at(record, '%H:%M:%S')}  INFO   test.happened"
        assert newline == "\n"
        assert trace.startswith("Traceback") and trace.endswith("ValueError: no good")


@pytest.mark.parametrize("fmt", ["console", "json"])
def test_settings_name_both_renderings(fmt):
    """The env var picks one of these by name, so a name missing here is a deployment that will
    not start."""
    assert fmt in settings.LOGGING["formatters"]
