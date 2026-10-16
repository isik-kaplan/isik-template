"""Handing a stored file to somebody a view has already decided may have it.

The view checks, nginx sends: the response carries no body, only an `X-Accel-Redirect` to one of the
`internal` locations in {{ cookiecutter.project_slug }}-server/template.nginx.conf. So the bytes never
tie up a uwsgi worker, ranges and resumed downloads work, and nothing serves the files without a view
saying so first - there is no public media URL to guess.

    def download(request, pk):
        report = get_object_or_404(Report, pk=pk, owner=request.user)
        return serve_file(report.file.name, as_attachment=True)
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
    """The response sending the stored file `name`, inline unless `as_attachment`, offered under
    `filename` (its own base name by default). The type is guessed from the name the way the upload
    was, and nginx keeps it."""
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

# nginx starts fetching the moment the response reaches it, so the URL only has to live that long.
# Seconds, and never seen by the client: it stays between the backend and nginx.
URL_LIFETIME = 60


def serve_file(name, *, as_attachment=False, filename=None):
    """The response sending the stored file `name`, inline unless `as_attachment`, offered under
    `filename` (its own base name by default). The type is the one the bucket stored it under; the
    disposition is this response's, which nginx keeps over the bucket's - a bucket asked for a range
    of the file may leave a signed-in disposition out."""
    response = HttpResponse()
    response[ACCEL_REDIRECT_HEADER] = STORAGE_LOCATION
    response[STORAGE_URL_HEADER] = default_storage.url(name, expire=URL_LIFETIME)
    response["Content-Disposition"] = content_disposition_header(as_attachment, filename or posixpath.basename(name))
    return response
{%- endif %}
