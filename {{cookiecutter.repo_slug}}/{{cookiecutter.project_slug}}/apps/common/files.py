"""A view authorizes, nginx sends, via `X-Accel-Redirect` to an `internal` location in
{{ cookiecutter.project_slug }}-server/template.nginx.conf: no worker tied up, and no public media URL.
"""

{%- if cookiecutter.storage == "disk" %}

import mimetypes
import posixpath
from urllib.parse import quote

from django.http import HttpResponse
from django.utils.http import content_disposition_header


ACCEL_REDIRECT_HEADER = "X-Accel-Redirect"

# nginx's alias for the `media` volume FileSystemStorage writes to.
MEDIA_LOCATION = "/internal/media/"


def serve_file(name, *, as_attachment=False, filename=None):
    """Inline unless `as_attachment`; the type is guessed from the name, as the upload's was."""
    content_type, _ = mimetypes.guess_type(name)
    response = HttpResponse(content_type=content_type or "application/octet-stream")
    response[ACCEL_REDIRECT_HEADER] = MEDIA_LOCATION + quote(name)
    response["Content-Disposition"] = content_disposition_header(as_attachment, filename or posixpath.basename(name))
    return response
{%- else %}

import posixpath

from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.utils.http import content_disposition_header


ACCEL_REDIRECT_HEADER = "X-Accel-Redirect"

# nginx's location fetching from the bucket, and the header it reads the presigned URL from.
STORAGE_LOCATION = "/internal/storage/"
STORAGE_URL_HEADER = "X-Storage-Url"

# Seconds; nginx fetches as soon as the response arrives, and the client never sees the URL.
URL_LIFETIME = 60


def serve_file(name, *, as_attachment=False, filename=None):
    """Inline unless `as_attachment`. The disposition is set here because a bucket answering a range
    may leave its own out."""
    response = HttpResponse()
    response[ACCEL_REDIRECT_HEADER] = STORAGE_LOCATION
    response[STORAGE_URL_HEADER] = default_storage.url(name, expire=URL_LIFETIME)
    response["Content-Disposition"] = content_disposition_header(as_attachment, filename or posixpath.basename(name))
    return response
{%- endif %}
