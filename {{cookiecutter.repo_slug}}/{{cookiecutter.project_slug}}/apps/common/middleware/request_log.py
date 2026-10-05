"""One line per request, written by nobody.

The half of logging that does not depend on somebody remembering to call anything: whatever a view
does or fails to do, the request it answered is written down. What it may say about the call is
`apps.common.logging.redaction`'s business, which allows rather than forbids.
"""

import time

from django.db import connection
from isik.django.apps.common.middleware import Middleware

from apps.common.logging import REQUEST, log
from apps.common.logging.redaction import body_of, client_ip_of, headers_of, query_of, worth_logging


class RequestLogMiddleware(Middleware):
    """Below `HistoryContextMiddleware`, so the context this line is annotated with is already open
    by the time the response comes back up."""

    def __call__(self, request):
        started = time.monotonic()
        # Read before the view, which is the only time it is the *request's* count rather than the
        # count plus whatever the response rendering went on to do.
        queries_before = len(connection.queries_log)
        # Taken before the response, because a view may consume the stream and leave nothing behind.
        body = body_of(request)
        response = self.get_response(request)
        elapsed_ms = round((time.monotonic() - started) * 1000)
        if worth_logging(response.status_code, elapsed_ms):
            log(
                REQUEST,
                method=request.method,
                path=request.path,
                status=response.status_code,
                duration_ms=elapsed_ms,
                db_queries=len(connection.queries_log) - queries_before,
                client_ip=client_ip_of(request),
                query=query_of(request) or None,
                body=body or None,
                headers=headers_of(request),
            )
        return response
