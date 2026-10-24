"""The API's rate limits: who they count against, and how a refusal reads.

Rates are lowered on `THROTTLE_RATES`, which DRF copies from settings once, at import.
"""

import pytest
from django.conf import settings
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.common.api.throttling import AnonymousRateThrottle, ScopedRateThrottle, UserRateThrottle
from apps.common.client_ip import CLIENT_IP_HEADER


@pytest.fixture
def rates(monkeypatch):
    def lower(**scopes):
        for scope, rate in scopes.items():
            monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, scope, rate)

    return lower


class Answering(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({})


class Scoped(Answering):
    throttle_scope = "uploads"


def _from(address, view=Answering):
    request = APIRequestFactory().get("/", headers={CLIENT_IP_HEADER: address})
    return view.as_view()(request)


def test_the_api_counts_everyone_signed_out_per_address_and_everyone_signed_in_per_account():
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] == [
        "apps.common.api.throttling.AnonymousRateThrottle",
        "apps.common.api.throttling.UserRateThrottle",
        "apps.common.api.throttling.ScopedRateThrottle",
    ]
    assert APIView.throttle_classes == [AnonymousRateThrottle, UserRateThrottle, ScopedRateThrottle]


def test_a_caller_past_its_rate_is_refused_with_how_long_to_wait(rates):
    rates(anon="2/minute")

    assert [_from("203.0.113.7").status_code for _ in range(2)] == [200, 200]
    refused = _from("203.0.113.7")

    assert refused.status_code == 429
    assert refused.data["code"] == "throttled"
    assert 0 < int(refused["Retry-After"]) <= 60


def test_the_count_is_the_address_nginx_named_not_the_one_the_request_came_from(rates):
    """Every request reaches the backend from nginx, so REMOTE_ADDR is the same for all of them."""
    rates(anon="1/minute")

    assert _from("203.0.113.7").status_code == 200
    assert _from("203.0.113.8").status_code == 200
    assert _from("203.0.113.7").status_code == 429


def test_one_ipv6_subscriber_is_one_caller_however_many_addresses_it_takes(rates):
    rates(anon="1/minute")

    assert _from("2001:db8:1:2::1").status_code == 200
    assert _from("2001:db8:1:2:ffff::9").status_code == 429
    assert _from("2001:db8:1:3::1").status_code == 200


def test_a_view_stricter_than_the_rest_names_its_own_rate(rates):
    rates(anon="100/minute", uploads="1/minute")

    assert _from("203.0.113.7", Scoped).status_code == 200
    assert _from("203.0.113.7", Scoped).status_code == 429
    assert _from("203.0.113.7").status_code == 200


def test_a_device_code_takes_few_tries():
    from apps.oauth_provider.api.viewsets.device_authorization import DeviceAuthorizationViewSet

    assert DeviceAuthorizationViewSet.throttle_scope == "device_codes"
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["device_codes"] == "10/minute"


@pytest.mark.django_db
def test_somebody_signed_in_is_counted_per_account_wherever_they_call_from(rates, django_user_model):
    rates(user="1/minute")
    alice = django_user_model.objects.create_user(username="alice", email="alice@example.test")

    def as_alice(address):
        request = APIRequestFactory().get("/", headers={CLIENT_IP_HEADER: address})
        force_authenticate(request, user=alice)
        return Answering.as_view()(request)

    assert as_alice("203.0.113.7").status_code == 200
    assert as_alice("198.51.100.4").status_code == 429


def test_the_anonymous_and_signed_in_rates_are_the_configured_ones():
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["anon"] == "120/minute"
    assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["user"] == "600/minute"


def test_requests_from_nobody_recorded_share_one_count(rates):
    """Nothing reaches the backend that way but a test or a shell; counted together, never let through."""
    rates(anon="1/minute")

    def from_nobody():
        request = APIRequestFactory().get("/")
        del request.META["REMOTE_ADDR"]
        return Answering.as_view()(request)

    assert from_nobody().status_code == 200
    assert from_nobody().status_code == 429
