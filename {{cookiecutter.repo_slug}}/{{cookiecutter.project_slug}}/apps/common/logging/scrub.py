"""`redaction`'s allowlist applied to Sentry, which attaches the request to every exception.

Imported by `settings`, so it reaches for nothing Django has not built yet.
"""

from urllib.parse import parse_qsl

from apps.common.logging.emit import ambient
from apps.common.logging.redaction import LOGGABLE_HEADERS, REDACTED, values_of


def scrub_event(event, hint):
    # Tagged so an event leads to its request's line and history rows, and to the access log of what it was part of.
    opened = ambient()
    for key in ("request_id", "correlation_id"):
        if opened.get(key):
            event.setdefault("tags", {}).setdefault(key, opened[key])
    request = event.get("request")
    if not request:
        return event
    if isinstance(request.get("data"), dict):
        request["data"] = values_of(request["data"].items())
    if isinstance(request.get("query_string"), str):
        # Sentry sends the raw string; a reset key in a link is a value like any other.
        request["query_string"] = values_of(parse_qsl(request["query_string"], keep_blank_values=True))
    if request.get("cookies"):
        # Not even by name: a session cookie is a credential.
        request["cookies"] = REDACTED
    if isinstance(request.get("headers"), dict):
        request["headers"] = {
            name: value for name, value in request["headers"].items() if name.lower() in LOGGABLE_HEADERS
        }
    return event
