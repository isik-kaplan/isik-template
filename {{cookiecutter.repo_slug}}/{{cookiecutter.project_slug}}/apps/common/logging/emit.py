"""The call itself: one function, required arguments, and a context nobody passes."""

import logging
import sys

from apps.common.logging.events import DECLARED, PAYLOAD, Event


LOGGER = logging.getLogger("{{ cookiecutter.project_slug }}")
# Its own logger, carrying its own handler and refusing to propagate - see `audit()`.
AUDIT_LOGGER = logging.getLogger("{{ cookiecutter.project_slug }}.audit")


def ambient() -> dict:
    """Who and where, read from the context pghistory already opened for this request or task.

    The same dict the history rows are annotated with, deliberately: a log line and a history row
    disagreeing about who did something is worse than either alone. Empty where nothing opened one -
    a check, a method pghistory's middleware skips - which is a fact about the line, not a failure.

    Read from pghistory's own tracker rather than from `open_history_context()`, which publishes
    only what the *middleware* opened: a Celery worker opens its context directly, so the published
    copy is empty there and every task line would lose its cause.
    """
    # Imported here rather than at the top: this package is imported while logging is configured,
    # which is before Django has its apps, and pghistory reaches for a setting on the way in.
    from pghistory.runtime import _tracker

    opened = getattr(_tracker, "value", None)
    if opened is None:
        return {}
    # The context row every history event of this request points at, so a line and the rows it
    # wrote are one lookup apart.
    return {"pgh_context": str(opened.id), **dict(opened.metadata)}


def _caller() -> str:
    """The module that called `log`, which is not always the frame above it.

    A wrapper around `log` puts its own frame there - mutation testing wraps every function in the
    tree, and the whole suite would then write `mutmut`'s trampoline as the place the code is.
    """
    frame = sys._getframe(1)
    while frame is not None:
        module = frame.f_globals.get("__name__", "")
        if module != __name__ and not module.startswith("mutmut."):
            return module
        frame = frame.f_back
    return ""


def _written(event: Event, logger: logging.Logger, note: str | None, fields: dict) -> None:
    """The half `log` and `audit` share: check the event, require its fields, build the line."""
    if DECLARED.get(event.name) is not event:
        raise ValueError(f"{event.name!r} is not a declared event - add it to apps.common.logging.events.")
    missing = tuple(name for name in event.requires if name not in fields)
    if missing:
        raise TypeError(f"{event.name!r} needs {', '.join(missing)}.")
    payload = {
        "event": event.name,
        # Taken from the frame rather than asked for: it says where the code is, which is worth
        # having beside the event name that says what happened.
        "code": _caller(),
        **ambient(),
        **fields,
    }
    if note is not None:
        payload["note"] = note
    logger.log(event.severity, event.name, extra={PAYLOAD: payload})


def log(event: Event, *, note: str | None = None, **fields) -> None:
    """Write one event down.

    The fields an event declared are required, because the twentieth call site is written by
    somebody who has read none of the previous nineteen. `note` is for a human and is never parsed;
    nothing should be knowable only from it.
    """
    if event.audited:
        raise ValueError(f"{event.name!r} is audited - write it with audit(), which cannot be turned down.")
    _written(event, LOGGER, note, fields)


def audit(event: Event, *, note: str | None = None, **fields) -> None:
    """Write down something that moved control of an account or of power between people.

    A separate sink rather than a severity: an audit record is never sampled, never dropped under
    load, and never in a stream somebody can quieten while an incident is running. Its logger
    carries its own handler and does not propagate, so turning the main logger down leaves it alone.

    Which events come here is the event's own property, so neither call can be made the wrong way.
    """
    if not event.audited:
        raise ValueError(f"{event.name!r} is not audited - write it with log().")
    _written(event, AUDIT_LOGGER, note, fields)
