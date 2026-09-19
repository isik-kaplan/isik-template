from django.http import HttpResponse
from hypothesis import given
from hypothesis import strategies as st

from apps.common.middleware.health_check import HealthCheckMiddleware


class _FakeRequest:
    def __init__(self, path):
        self.path = path


def test_health_path_returns_ok():
    middleware = HealthCheckMiddleware(get_response=lambda request: HttpResponse("unreachable"))
    response = middleware(_FakeRequest("/health/"))
    assert response.status_code == 200
    assert response.content == b"ok"


@given(path=st.text().filter(lambda p: p != "/health/"))
def test_non_health_paths_pass_through(path):
    # Exact-match only, e.g. "/health/x" or "healthy" must not accidentally match.
    sentinel = HttpResponse("passed through")
    middleware = HealthCheckMiddleware(get_response=lambda request: sentinel)
    assert middleware(_FakeRequest(path)) is sentinel
