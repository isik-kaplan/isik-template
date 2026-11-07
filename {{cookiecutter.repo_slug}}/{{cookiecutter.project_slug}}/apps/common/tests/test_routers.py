import pytest
from django.urls import Resolver404, resolve

from apps.common.api.routers import AppRouter
from apps.users.api.viewsets.user import UserViewSet


def test_an_app_router_adds_no_root_view_but_keeps_format_suffixes():
    """Four of them share the API's root path, which would otherwise answer four times over."""
    router = AppRouter()
    router.register("users", UserViewSet, basename="users")
    names = {pattern.name for pattern in router.urls}

    assert "api-root" not in names
    assert any(str(pattern.pattern).endswith(r"\.(?P<format>[a-z0-9]+)/?$") for pattern in router.urls)


def test_the_api_has_no_root_listing():
    with pytest.raises(Resolver404):
        resolve("/v0/")
