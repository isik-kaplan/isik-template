"""The same rule, applied to the second sink.

Sentry reports an exception with the request that caused it attached, so a body this deployment
spent `redaction` refusing to write to stdout would arrive there in full instead. One rule, both
places: allow by name, drop everything else.

Imported by `settings`, so it reaches for nothing Django has not built yet.
"""

from apps.common.logging.redaction import LOGGABLE_HEADERS, REDACTED, values_of


def scrub_event(event, hint):
    """`before_send`: what Sentry is allowed to keep of the request."""
    request = event.get("request")
    if not request:
        return event
    if isinstance(request.get("data"), dict):
        request["data"] = values_of(request["data"].items())
    if request.get("cookies"):
        # Never by name either: a session cookie is a credential, and which cookies somebody holds
        # is not worth the one that lets you become them.
        request["cookies"] = REDACTED
    if isinstance(request.get("headers"), dict):
        request["headers"] = {
            name: value for name, value in request["headers"].items() if name.lower() in LOGGABLE_HEADERS
        }
    return event
