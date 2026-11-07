from django.http import HttpResponse
from hypothesis import given
from hypothesis import strategies as st

from apps.common.middleware.health_check import HealthCheckMiddleware
from apps.common.tests.test_health_check_middleware import _FakeRequest


@given(path=st.text().filter(lambda p: p != "/health/"))
def test_only_the_exact_health_path_is_answered_there(path):
    sentinel = HttpResponse("passed through")
    middleware = HealthCheckMiddleware(get_response=lambda request: sentinel)
    assert middleware(_FakeRequest(path)) is sentinel
