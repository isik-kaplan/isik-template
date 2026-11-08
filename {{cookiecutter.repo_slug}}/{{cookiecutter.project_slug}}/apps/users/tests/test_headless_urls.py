from pathlib import Path

import pytest
import yaml
from allauth.headless import urls as allauth_urls
from allauth.headless.constants import Client
from allauth.headless.spec.internal import schema
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
{%- if cookiecutter.phone == "none" %}
from django.urls import Resolver404, URLResolver, path, resolve
from django.urls.resolvers import RoutePattern
{%- else %}
from django.urls import Resolver404, path, resolve
{%- endif %}

from apps.common.links import auth_path
from apps.users import headless_urls
from apps.users.headless_spec import ALLAUTH_VERSION, VERSIONED
from apps.users.reauthentication.routing import walk
from apps.users.tests.conftest import AUTH_URLCONF
{%- if cookiecutter.phone == "none" %}


PHONE_VIEWS = {"ManagePhoneView", "VerifyPhoneView", "ResendPhoneVerificationCodeView"}
{%- endif %}


@pytest.mark.parametrize("client", list(Client))
def test_allauth_still_builds_each_client_under_one_v1(client):
    built = allauth_urls.build_urlpatterns(client)

    assert [str(pattern.pattern) for pattern in built] == ["v1/"]


@pytest.mark.parametrize("client", list(Client))
def test_what_is_mounted_is_everything_allauth_built(client):
    built = walk(allauth_urls.build_urlpatterns(client))
{%- if cookiecutter.phone == "none" %}
    unwrapped = [
        (route.removeprefix(ALLAUTH_VERSION), view.view_class)
        for route, view in built
        if view.view_class.__name__ not in PHONE_VIEWS
    ]
{%- else %}
    unwrapped = [(route.removeprefix(ALLAUTH_VERSION), view.view_class) for route, view in built]
{%- endif %}

    assert [(route, view.view_class) for route, view in walk(headless_urls.unversioned(client))] == unwrapped
{%- if cookiecutter.phone == "none" %}


@pytest.mark.parametrize("client", list(Client))
def test_no_phone_route_is_served_since_no_account_has_a_phone_number(client):
    """allauth's adapter raises on every phone call, so each of these would answer with a 500."""
    built = {view.view_class.__name__ for _, view in walk(allauth_urls.build_urlpatterns(client))}
    mounted = {view.view_class.__name__ for _, view in walk(headless_urls.unversioned(client))}

    assert PHONE_VIEWS <= built
    assert mounted == built - PHONE_VIEWS


def test_dropping_a_route_keeps_everything_else_about_where_it_was_mounted():
    nested = URLResolver(
        RoutePattern("inner/"),
        [
            path("phone", lambda request: None, name="manage_phone"),
            path("email", lambda request: None, name="manage_email"),
        ],
        {"client": "browser"},
        "inner_app",
        "inner_namespace",
    )

    (kept,) = headless_urls.served([nested])

    assert [pattern.name for pattern in kept.url_patterns] == ["manage_email"]
    assert (str(kept.pattern), kept.default_kwargs) == ("inner/", {"client": "browser"})
    assert (kept.app_name, kept.namespace) == ("inner_app", "inner_namespace")


@pytest.mark.django_db
def test_the_phone_page_is_not_found_rather_than_a_server_error(client, signed_in):
    response = client.get("/v0/browser/account/phone", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    assert response.status_code == 404
{%- else %}


@pytest.mark.django_db
def test_the_phone_page_answers_with_the_number_on_the_account(client, signed_in):
    signed_in.phone, signed_in.phone_verified = "+14155550123", True
    signed_in.save()

    response = client.get("/v0/browser/account/phone", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    assert response.status_code == 200
    assert response.json()["data"] == [{"phone": "+14155550123", "verified": True}]
{%- endif %}


@pytest.mark.parametrize(
    "built",
    [
        [path("v1/", lambda request: None), path("v2/", lambda request: None)],
        [path("v2/", lambda request: None)],
        [],
    ],
)
def test_routes_that_are_no_longer_one_v1_are_refused_rather_than_half_mounted(monkeypatch, built):
    monkeypatch.setattr(headless_urls, "build_urlpatterns", lambda client: built)

    with pytest.raises(ImproperlyConfigured, match="^allauth's headless routes for browser are no longer one v1/"):
        headless_urls.unversioned(Client.BROWSER)


@pytest.mark.parametrize("client", ["browser", "app"])
def test_each_client_answers_without_allauths_version(client):
    assert auth_path(f"headless:{client}:account:login") == f"/v0/{client}/auth/login"

    with pytest.raises(Resolver404):
        resolve(f"/v0/{client}/v1/auth/login", urlconf=AUTH_URLCONF)


def test_allauth_still_documents_every_path_under_one_v1():
    """The step that roots allauth's paths takes this segment off; a path written otherwise would keep it."""
    with open(Path(schema.__file__).parent.parent / "doc/openapi.yaml", "rb") as document:
        paths = yaml.safe_load(document)["paths"]

    assert paths
    assert [path for path in paths if not VERSIONED.match(path.removeprefix("/_allauth"))] == []


@pytest.mark.django_db
def test_the_served_specification_describes_the_routes_that_answer(client):
    response = client.get("/v0/openapi.json", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    paths = response.json()["paths"]
    assert {"/v0/{client}/auth/login", "/v0/browser/auth/provider/redirect", "/v0/app/tokens/refresh"} <= paths.keys()
    assert [path for path in paths if ALLAUTH_VERSION in path] == []


@pytest.mark.parametrize(
    ("clients", "serving", "mounted"),
    [
        (("browser", "app"), True, ["browser/", "app/", ""]),
        (("app",), False, ["app/"]),
        (("browser",), True, ["browser/", ""]),
    ],
)
def test_what_is_mounted_follows_allauths_own_settings(settings, clients, serving, mounted):
    settings.HEADLESS_CLIENTS = clients
    settings.HEADLESS_SERVE_SPECIFICATION = serving

    assert [str(pattern.pattern) for pattern in headless_urls.headless_urlpatterns()] == mounted
