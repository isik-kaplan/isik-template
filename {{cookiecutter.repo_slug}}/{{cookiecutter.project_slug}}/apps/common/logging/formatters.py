"""Two renderings of one record; a library's record carries none of our fields and must still show."""

import json
import logging

from apps.common.logging.events import PAYLOAD


# A library's record is identified by the logger that wrote it.
def payload_of(record: logging.LogRecord) -> dict:
    return getattr(record, PAYLOAD, None) or {"event": record.name, "logger": record.name}


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
        rest = " ".join(f"{name}={value}" for name, value in payload.items() if value is not None)
        drawn = "  ".join(head) + (f"  {rest}" if rest else "")
        if not hasattr(record, PAYLOAD):
            drawn += f"  {record.getMessage()}"
        if record.exc_info:
            drawn += "\n" + self.formatException(record.exc_info)
        return drawn
