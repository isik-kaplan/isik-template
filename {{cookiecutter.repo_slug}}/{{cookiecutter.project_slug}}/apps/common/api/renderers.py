"""msgspec's encoder, taught the one shape DRF hands it that it refuses.

msgspec encodes exact types, so a `str` subclass raises rather than encoding as a string. Every DRF
error body is built from `ErrorDetail`, which is one - so without this a 401 renders as a 500.

`obj[:]` rather than `str(obj)`: `str()` on a `str` subclass returns the subclass unchanged, which is
the same TypeError one call later.
"""

from django_msgspec import enc_hook as encode_django_type
from django_msgspec.rest_framework import JSONRenderer as MsgspecJSONRenderer


def enc_hook(obj):
    if isinstance(obj, str):
        return obj[:]
    return encode_django_type(obj)


class JSONRenderer(MsgspecJSONRenderer):
    enc_hook = staticmethod(enc_hook)
