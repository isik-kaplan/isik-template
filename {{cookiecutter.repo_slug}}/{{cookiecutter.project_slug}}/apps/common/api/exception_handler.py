"""Puts a refusal's `code`, which DRF drops, beside `detail`, so two 403s differ by more than prose.

Field validation keeps its `{"field": ["sentence"]}` shape.
"""

from rest_framework.views import exception_handler as drf_exception_handler

from apps.common.logging import PERMISSION_REFUSED, log


def exception_handler(exc, context):
    """Only a single `ErrorDetail` has a code, so finding one means the body is `{"detail": ...}`.
    Logged here, not in a permission class, because a permission answers on every check."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code = getattr(getattr(exc, "detail", None), "code", None)
    if code:
        response.data["code"] = code
    if response.status_code == 403:
        # Django's PermissionDenied arrives unconverted, with no code.
        log(PERMISSION_REFUSED, permission=code or "")
    return response
