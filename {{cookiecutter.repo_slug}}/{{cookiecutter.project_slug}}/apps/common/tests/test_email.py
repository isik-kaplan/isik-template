from unittest.mock import patch

from django.conf import settings
from django.test import RequestFactory

from apps.common.email import mjml_template, text_template


def test_mjml_template_adds_site_name_and_request_host():
    request = RequestFactory().get("/", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    with patch("apps.common.email._mjml_template") as mocked:
        mjml_template("some/template.html", {"extra": "value"}, request)

    mocked.assert_called_once_with(
        "some/template.html",
        {"site_name": "{{ cookiecutter.project_name }}", "site_url": f"auth.{settings.PARENT_HOST}", "extra": "value"},
        request,
    )


def test_text_template_adds_site_name_and_request_host():
    request = RequestFactory().get("/", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    with patch("apps.common.email._text_template") as mocked:
        text_template("some/template.txt", {"extra": "value"}, request)

    mocked.assert_called_once_with(
        "some/template.txt",
        {"site_name": "{{ cookiecutter.project_name }}", "site_url": f"auth.{settings.PARENT_HOST}", "extra": "value"},
        request,
    )


def test_site_url_is_empty_without_a_request():
    with patch("apps.common.email._mjml_template") as mocked:
        mjml_template("t.html", {}, None)

    assert mocked.call_args[0][1]["site_url"] == ""


def test_context_overrides_the_global_defaults_on_collision():
    with patch("apps.common.email._text_template") as mocked:
        text_template("t.txt", {"site_name": "Custom name", "site_url": "custom.example.test"}, None)

    assert mocked.call_args[0][1] == {"site_name": "Custom name", "site_url": "custom.example.test"}
