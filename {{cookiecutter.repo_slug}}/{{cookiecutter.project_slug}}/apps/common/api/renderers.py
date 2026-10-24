"""msgspec refuses `str` subclasses such as DRF's `ErrorDetail`, which would render every error as a 500.

`obj[:]`, not `str(obj)`: `str()` returns a `str` subclass unchanged.
"""

from django_msgspec import enc_hook as encode_django_type
from django_msgspec.rest_framework import JSONRenderer as MsgspecJSONRenderer


def enc_hook(obj):
    if isinstance(obj, str):
        return obj[:]
    return encode_django_type(obj)


class JSONRenderer(MsgspecJSONRenderer):
    enc_hook = staticmethod(enc_hook)
