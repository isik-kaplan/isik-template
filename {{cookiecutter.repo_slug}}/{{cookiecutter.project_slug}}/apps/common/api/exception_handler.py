"""isik's handler, which puts a refusal's `code` beside its `detail` so two 403s differ by more than prose, and
answers Django's own ValidationError as a 400. A field's messages come as `{"field": [{"message", "code"}]}`."""

from isik.django.drf.error_handling import exception_handler as isik_exception_handler

from apps.common.logging import PERMISSION_REFUSED, log


def exception_handler(exc, context):
    """Logged here, not in a permission class, because a permission answers on every check."""
    response = isik_exception_handler(exc, context)
    if response is not None and response.status_code == 403:
        # A list of sentences is a body too, and has no code.
        code = response.data.get("code", "") if isinstance(response.data, dict) else ""
        log(PERMISSION_REFUSED, permission=code)
    return response
