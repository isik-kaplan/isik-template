"""What of a request may be logged, by allowlist: a blocklist logs every new field until somebody notices.

Bodies and query strings are logged by key, with values only for `LOGGABLE` names.
"""

import json

from django.conf import settings

from apps.common.client_ip import client_ip

from {{ cookiecutter.project_slug }}.config import CONFIG


# Add a name only when no value it could ever carry identifies somebody.
LOGGABLE = frozenset({"page", "page_size", "ordering", "format"})

LOGGABLE_HEADERS = frozenset({"content-type", "content-length", "user-agent", "referer", "accept-language"})

REDACTED = "[redacted]"


def values_of(pairs) -> dict:
    return {name: (value if name in LOGGABLE else REDACTED) for name, value in pairs}


def body_of(request) -> dict | None:
    """Only a JSON body within DATA_UPLOAD_MAX_MEMORY_SIZE is read, since `request.body` raises past it.
    Anything else is reported by size alone, without touching the stream."""
    if request.method not in ("POST", "PUT", "PATCH"):
        return None
    size = size_of(request)
    # Django reads no further than the declared length.
    if not size:
        return {}
    limit = settings.DATA_UPLOAD_MAX_MEMORY_SIZE
    if request.content_type != "application/json" or (limit is not None and size > limit):
        return {"unparsed_bytes": size}
    try:
        parsed = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return {"unparsed_bytes": size}
    if not isinstance(parsed, dict):
        return {"unparsed_bytes": size}
    return values_of(parsed.items())


def size_of(request) -> int:
    """Read as Django reads it, so an unreadable length counts as none."""
    try:
        return int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError:
        return 0


def query_of(request) -> dict:
    return values_of(request.GET.items())


def headers_of(request) -> dict:
    return {name: value for name, value in request.headers.items() if name.lower() in LOGGABLE_HEADERS}


def client_ip_of(request) -> str:
    return client_ip(request)


def worth_logging(status: int, elapsed_ms: int) -> bool:
    asked = CONFIG.LOGGING.REQUESTS
    if asked == "none":
        return False
    if asked == "all":
        return True
    slow_after = CONFIG.LOGGING.SLOW_REQUEST_MS
    # Slowness earns a line whatever the status; zero turns that off.
    return not (200 <= status < 300) or (slow_after > 0 and elapsed_ms >= slow_after)
