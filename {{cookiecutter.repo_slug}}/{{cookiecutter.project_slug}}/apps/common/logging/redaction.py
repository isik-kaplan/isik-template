"""What of a request may be written down, decided by allowing rather than by forbidding.

A blocklist of sensitive names is wrong here and the reason is not taste: it is a guess maintained
by whoever remembers, every new field is logged in full until somebody notices, and the failure is
silent and permanent - a password written to a log yesterday is not un-written by adding its name to
the list today.

So nothing is logged by value unless it is named. A body and a query string are reported by the
*keys* they carried, which answers what shape a call had without ever writing what was in it, and
the values of names in `LOGGABLE` besides. Headers are allowlisted outright: the three highest-value
secrets in a request - `Authorization`, `Cookie`, `X-CSRFToken` - are headers, so a body-only rule
would miss all three.
"""

import json

from {{ cookiecutter.project_slug }}.config import CONFIG


# Values safe to write down wherever they appear, because they are the caller's own navigation
# rather than anything about a person. Anything absent is reported by name only - add a name here
# only when no value it could ever carry identifies somebody.
LOGGABLE = frozenset({"page", "page_size", "ordering", "format"})

# Headers worth keeping, named rather than filtered: every other one is dropped, including the ones
# nobody has thought of yet.
LOGGABLE_HEADERS = frozenset({"content-type", "content-length", "user-agent", "referer", "accept-language"})

REDACTED = "[redacted]"


def values_of(pairs) -> dict:
    """Each key, and its value only where the name says the value is safe."""
    return {name: (value if name in LOGGABLE else REDACTED) for name, value in pairs}


def body_of(request) -> dict | None:
    """What a write carried, by name.

    Read off the already-buffered body rather than the stream: Django reads a form body itself, and
    consuming it here would empty what the view is about to parse. A body that is not JSON is
    reported by size alone - it may be an upload, and an upload's content is never a log line.
    """
    if request.method not in ("POST", "PUT", "PATCH"):
        return None
    try:
        parsed = json.loads(request.body or b"{}")
    except (ValueError, UnicodeDecodeError):
        return {"unparsed_bytes": len(request.body)}
    if not isinstance(parsed, dict):
        return {"unparsed_bytes": len(request.body)}
    return values_of(parsed.items())


def query_of(request) -> dict:
    return values_of(request.GET.items())


def headers_of(request) -> dict:
    return {name: value for name, value in request.headers.items() if name.lower() in LOGGABLE_HEADERS}


def client_ip_of(request) -> str:
    """The address nginx saw, not the one the caller claimed.

    `X-Real-IP` is set from `$remote_addr` and *overwritten* on every proxy pass, so a client sending
    one of its own has it replaced - unlike `X-Forwarded-For`, which appends and whose left-hand
    entries are whatever the caller wrote. A proxy in front of nginx makes this that proxy's
    address, which is a deployment fact rather than something this can correct.
    """
    # Read from META rather than `headers`, whose case-insensitive lookup no test could tell apart.
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR", "")


def worth_logging(status: int, elapsed_ms: int) -> bool:
    """Whether this request earns a line, per `LOGGING__REQUESTS`."""
    asked = CONFIG.LOGGING.REQUESTS
    if asked == "none":
        return False
    if asked == "all":
        return True
    slow_after = CONFIG.LOGGING.SLOW_REQUEST_MS
    # A 200 that took nine seconds is the line somebody went looking for, so slowness earns one
    # whatever the status. Zero turns that off rather than making every request slow.
    return not (200 <= status < 300) or (slow_after > 0 and elapsed_ms >= slow_after)
