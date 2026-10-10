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

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, PermissionDenied

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

    Only a JSON body within Django's in-memory limit is read: `request.body` raises past that limit,
    which a multipart upload streamed to disk never would, and anything else - an upload above all,
    whose content is never a log line - is reported by size alone without touching the stream.
    """
    if request.method not in ("POST", "PUT", "PATCH"):
        return None
    size = size_of(request)
    # Django reads no further than the declared length, so nothing declared is nothing sent.
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
    """The body's declared length, read the way Django reads it, so an unreadable one counts as none."""
    try:
        return int(request.META.get("CONTENT_LENGTH") or 0)
    except ValueError:
        return 0


def query_of(request) -> dict:
    return values_of(request.GET.items())


def headers_of(request) -> dict:
    return {name: value for name, value in request.headers.items() if name.lower() in LOGGABLE_HEADERS}


def client_ip_of(request) -> str:
    """The caller's address the way allauth reads it, so this line and its rate limits agree.

    allauth honours `TRUSTED_PROXY_COUNT` over `X-Forwarded-For`; a request whose address it cannot
    work out is still worth its line, so that refusal is an empty address here.
    """
    # Imported here: settings.py imports this module, and allauth's adapter needs the apps loaded.
    from allauth.account.adapter import get_adapter

    try:
        return get_adapter().get_client_ip(request)
    except (PermissionDenied, ImproperlyConfigured):
        return ""


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
