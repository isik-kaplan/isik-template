"""Each helper reverses on its own host, whatever the default host or ROOT_URLCONF says."""

import uuid

import pytest
from django.urls import NoReverseMatch
from django_hosts.resolvers import get_host

from apps.common.links import admin_path, api_path, auth_path


ID = uuid.UUID("01900000-0000-7000-8000-000000000000")


@pytest.fixture
def default_host_is_auth(settings):
    """get_host() caches the default it resolved, so the cache goes with the setting."""
    settings.DEFAULT_HOST = "auth"
    get_host.cache_clear()
    yield
    get_host.cache_clear()


def test_api_path_names_the_api_host_rather_than_the_default(default_host_is_auth):
    assert api_path("users:users-list") == "/v0/users/"


def test_a_path_takes_its_arguments_by_position_or_by_name():
    assert api_path("users:users-detail", ID) == f"/v0/users/{ID}/"
    assert api_path("users:users-detail", pk=ID) == f"/v0/users/{ID}/"


def test_auth_path_names_the_auth_host():
    assert auth_path("headless:browser:account:login") == "/v0/browser/auth/login"


def test_admin_path_names_the_admin_host():
    assert admin_path("admin:users_user_change", ID) == f"/users/user/{ID}/change/"


@pytest.mark.parametrize(("helper", "name"), [(api_path, "admin:index"), (auth_path, "users-list")])
def test_a_name_only_another_host_mounts_is_not_found(helper, name):
    with pytest.raises(NoReverseMatch):
        helper(name)


@pytest.mark.parametrize(("helper", "host"), [(api_path, "api"), (auth_path, "auth"), (admin_path, "admin")])
def test_each_hands_reverse_its_hosts_urlconf_and_every_argument(monkeypatch, helper, host):
    calls = []
    monkeypatch.setattr("apps.common.links.reverse", lambda *args, **kwargs: calls.append((args, kwargs)))

    helper("a-name", "positional")
    helper("a-name", key="value")

    urlconf = get_host(host).urlconf
    assert calls == [
        (("a-name",), {"urlconf": urlconf, "args": ("positional",), "kwargs": {}}),
        (("a-name",), {"urlconf": urlconf, "args": (), "kwargs": {"key": "value"}}),
    ]
