"""serve_file() answers with where nginx finds the file, never the file itself. nginx's half, the
`internal` location it names, is {{ cookiecutter.project_slug }}-server/template.nginx.conf's."""
{%- if cookiecutter.storage == "disk" %}

import pytest

from apps.common.files import serve_file


def test_the_file_is_left_to_nginx_under_its_media_alias():
    response = serve_file("reports/2026/summary.pdf")

    assert response["X-Accel-Redirect"] == "/internal/media/reports/2026/summary.pdf"
    assert response.content == b""


def test_a_name_nginx_could_misread_is_percent_encoded():
    response = serve_file("dir/my report ü?#.txt")

    assert response["X-Accel-Redirect"] == "/internal/media/dir/my%20report%20%C3%BC%3F%23.txt"


@pytest.mark.parametrize(
    ("name", "content_type"),
    [("a/b.pdf", "application/pdf"), ("a/b.png", "image/png"), ("a/no-extension", "application/octet-stream")],
)
def test_the_type_is_guessed_from_the_name_the_way_the_upload_was(name, content_type):
    assert serve_file(name)["Content-Type"] == content_type


@pytest.mark.parametrize(
    ("kwargs", "disposition"),
    [
        ({}, 'inline; filename="summary.pdf"'),
        ({"as_attachment": True}, 'attachment; filename="summary.pdf"'),
        ({"filename": "Q3 report.pdf"}, 'inline; filename="Q3 report.pdf"'),
        ({"as_attachment": True, "filename": "Q3.pdf"}, 'attachment; filename="Q3.pdf"'),
    ],
)
def test_it_is_shown_inline_or_offered_as_a_download_under_its_own_name_or_a_given_one(kwargs, disposition):
    assert serve_file("reports/summary.pdf", **kwargs)["Content-Disposition"] == disposition
{%- else %}

import uuid
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from apps.common.files import serve_file


@pytest.fixture
def stored():
    name = default_storage.save(f"serve-file/{uuid.uuid4().hex}/summary ü.txt", ContentFile(b"hello"))
    yield name
    default_storage.delete(name)


def _url(response):
    return urlsplit(response["X-Storage-Url"])


def test_the_file_is_left_to_nginx_with_a_short_lived_url_to_fetch_it_from(stored):
    response = serve_file(stored)

    assert response["X-Accel-Redirect"] == "/internal/storage/"
    assert response.content == b""
    assert parse_qs(_url(response).query)["X-Amz-Expires"] == ["60"]


def test_the_url_is_the_one_nginx_fetches_and_the_bucket_answers_it(stored):
    with urlopen(serve_file(stored)["X-Storage-Url"]) as answer:
        assert answer.read() == b"hello"


@pytest.mark.parametrize(
    ("kwargs", "disposition"),
    [
        ({}, "inline; filename*=utf-8''summary%20%C3%BC.txt"),
        ({"as_attachment": True}, "attachment; filename*=utf-8''summary%20%C3%BC.txt"),
        ({"filename": "Q3.txt"}, 'inline; filename="Q3.txt"'),
        ({"as_attachment": True, "filename": "Q3.txt"}, 'attachment; filename="Q3.txt"'),
    ],
)
def test_it_is_shown_inline_or_offered_as_a_download_under_its_own_name_or_a_given_one(stored, kwargs, disposition):
    assert serve_file(stored, **kwargs)["Content-Disposition"] == disposition
{%- endif %}
