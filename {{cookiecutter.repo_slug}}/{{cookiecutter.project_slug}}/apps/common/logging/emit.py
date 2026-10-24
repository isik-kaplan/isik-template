import logging
import sys

from apps.common.logging.events import DECLARED, PAYLOAD, Event


LOGGER = logging.getLogger("{{ cookiecutter.project_slug }}")
AUDIT_LOGGER = logging.getLogger("{{ cookiecutter.project_slug }}.audit")


def ambient() -> dict:
    """Who and where, from pghistory's tracker, so a log line and a history row agree.

    Not `open_history_context()`: it publishes only what the middleware opened, empty in a Celery worker.
    """
    # Lazy: this is imported while logging is configured, before pghistory can read settings.
    from pghistory.runtime import _tracker

    opened = getattr(_tracker, "value", None)
    if opened is None:
        return {}
    # The context row this request's history events point at.
    return {"pgh_context": str(opened.id), **dict(opened.metadata)}


def _caller() -> str:
    """The module that called `log`, skipping wrappers such as mutmut's trampolines."""
    frame = sys._getframe(1)
    while frame is not None:
        module = frame.f_globals.get("__name__", "")
        if module != __name__ and not module.startswith("mutmut."):
            return module
        frame = frame.f_back
    return ""


def _written(event: Event, logger: logging.Logger, note: str | None, fields: dict) -> None:
    if DECLARED.get(event.name) is not event:
        raise ValueError(f"{event.name!r} is not a declared event - add it to apps.common.logging.events.")
    missing = tuple(name for name in event.requires if name not in fields)
    if missing:
        raise TypeError(f"{event.name!r} needs {', '.join(missing)}.")
    payload = {
        "event": event.name,
        "code": _caller(),
        **ambient(),
        **fields,
    }
    if note is not None:
        payload["note"] = note
    logger.log(event.severity, event.name, extra={PAYLOAD: payload})


def log(event: Event, *, note: str | None = None, **fields) -> None:
    """`note` is for a human and never parsed; nothing should be knowable only from it."""
    if event.audited:
        raise ValueError(f"{event.name!r} is audited - write it with audit(), which cannot be turned down.")
    _written(event, LOGGER, note, fields)


def audit(event: Event, *, note: str | None = None, **fields) -> None:
    """Something that moved control of an account or of power between people.

    Its logger has its own handler and does not propagate, so turning the main logger down leaves it alone.
    """
    if not event.audited:
        raise ValueError(f"{event.name!r} is not audited - write it with log().")
    _written(event, AUDIT_LOGGER, note, fields)
