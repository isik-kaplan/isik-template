import pytest
from django.http import HttpResponse

from apps.common.middleware.health_check import HealthCheckMiddleware


class _FakeRequest:
    def __init__(self, path):
        self.path = path


def test_health_path_returns_ok():
    middleware = HealthCheckMiddleware(get_response=lambda request: HttpResponse("unreachable"))
    response = middleware(_FakeRequest("/health/"))
    assert response.status_code == 200
    assert response.content == b"ok"


@pytest.mark.parametrize("path", ["/health", "/health/x", "/healthy/", "health/", "/HEALTH/"])
def test_only_the_exact_health_path_is_answered_there(path):
    sentinel = HttpResponse("passed through")
    middleware = HealthCheckMiddleware(get_response=lambda request: sentinel)
    assert middleware(_FakeRequest(path)) is sentinel
