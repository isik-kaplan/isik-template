"""Refusals that say what they are, not only what they read like, and that leave a line behind.

DRF renders an exception's `detail` and drops its `code`, so two refusals sharing a status - "not
allowed" and "finish setting up first", both 403 - can only be told apart by their translated prose.
The code goes in the body beside `detail`, purely additively. Field validation is untouched: its
shape is `{"field": ["sentence"]}`, and a code per error would make each value an object.
"""

from rest_framework.views import exception_handler as drf_exception_handler

from apps.common.logging import PERMISSION_REFUSED, log


def exception_handler(exc, context):
    """DRF's, plus the refusal's own code where it has one, plus one log line per 403.

    A code lives on an `ErrorDetail`, and DRF writes `{"detail": ...}` for exactly the exceptions
    whose detail is one - a list or a dict becomes the body itself - so finding a code here already
    means the body is the one-sentence shape. The log line is written here rather than in a permission
    class: a permission answers on every check, and this is the one place a refusal passes exactly once.
    """
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code = getattr(getattr(exc, "detail", None), "code", None)
    if code:
        response.data["code"] = code
    if response.status_code == 403:
        # Django's own PermissionDenied arrives here before DRF converts it, carrying no code.
        log(PERMISSION_REFUSED, permission=code or "")
    return response
