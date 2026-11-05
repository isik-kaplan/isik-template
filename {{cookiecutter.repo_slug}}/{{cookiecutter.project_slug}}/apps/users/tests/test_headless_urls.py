from pathlib import Path

import pytest
import yaml
from allauth.headless import urls as allauth_urls
from allauth.headless.constants import Client
from allauth.headless.spec.internal import schema
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.urls import Resolver404, path, resolve, reverse

from apps.users import headless_urls
from apps.users.headless_spec import ALLAUTH_VERSION, VERSIONED
from apps.users.reauthentication.routing import walk
from apps.users.tests.conftest import AUTH_URLCONF


@pytest.mark.parametrize("client", list(Client))
def test_allauth_still_builds_each_client_under_one_v1(client):
    built = allauth_urls.build_urlpatterns(client)

    assert [str(pattern.pattern) for pattern in built] == ["v1/"]


@pytest.mark.parametrize("client", list(Client))
def test_what_is_mounted_is_everything_allauth_built(client):
    built = walk(allauth_urls.build_urlpatterns(client))
    unwrapped = [(route.removeprefix(ALLAUTH_VERSION), view.view_class) for route, view in built]

    assert [(route, view.view_class) for route, view in walk(headless_urls.unversioned(client))] == unwrapped


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
    assert reverse(f"headless:{client}:account:login", urlconf=AUTH_URLCONF) == f"/v0/{client}/auth/login"

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
