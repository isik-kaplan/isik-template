"""Two renderings of one record. The convention is the fields; this is only how they are drawn.

A layout is not a format to query against - a regex over `[a] [b] <text>` is what a field lookup
exists to replace - so the record is a mapping and these decide what a reader sees. Both handle a
record from a library, which carries none of our fields and must not be swallowed for it.
"""

import json
import logging

from apps.common.logging.events import PAYLOAD


# Read off the record rather than inferred: a library's line has none of ours, and what identifies
# it is the logger that wrote it.
def payload_of(record: logging.LogRecord) -> dict:
    return getattr(record, PAYLOAD, None) or {"event": record.name, "logger": record.name}


# Shown before the loose fields, in this order, because it is the order somebody reads them in:
# what happened, who did it, and which request.
LEADING = ("event", "user", "request_id")


class JSONFormatter(logging.Formatter):
    """One object per line, for a collector."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}Z",
            "severity": record.levelname,
            **payload_of(record),
        }
        if record.exc_info:
            kind, value, _ = record.exc_info
            payload["exception"] = {"type": kind.__name__, "message": str(value)}
        # A library's line says what it says in prose, and dropping it would lose the only thing it
        # carries.
        if not hasattr(record, PAYLOAD):
            payload["message"] = record.getMessage()
        return json.dumps(payload, default=str)


class ConsoleFormatter(logging.Formatter):
    """One aligned line, for a person."""

    def format(self, record: logging.LogRecord) -> str:
        payload = dict(payload_of(record))
        when = self.formatTime(record, "%H:%M:%S") + f".{int(record.msecs):03d}"
        head = [f"{when}  {record.levelname:<5}"]
        head += [str(payload.pop(name)) for name in LEADING if payload.get(name) is not None]
        # Whatever is left, in declaration order - an event's own fields are what distinguish two
        # lines that are otherwise the same line.
        rest = " ".join(f"{name}={value}" for name, value in payload.items() if value is not None)
        drawn = "  ".join(head) + (f"  {rest}" if rest else "")
        if not hasattr(record, PAYLOAD):
            drawn += f"  {record.getMessage()}"
        if record.exc_info:
            drawn += "\n" + self.formatException(record.exc_info)
        return drawn
