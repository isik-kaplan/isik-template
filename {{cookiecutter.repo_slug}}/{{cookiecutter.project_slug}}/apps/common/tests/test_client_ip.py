"""Whose request it is: nginx's answer, never the request's own word for it."""

import pytest
from allauth.account.adapter import get_adapter
from django.core.exceptions import PermissionDenied
from django.test import RequestFactory

from apps.common.client_ip import client_ip


def _request(remote_addr="172.20.0.5", **headers):
    request = RequestFactory().get("/", headers=headers)
    if remote_addr is None:
        del request.META["REMOTE_ADDR"]
    else:
        request.META["REMOTE_ADDR"] = remote_addr
    return request


def test_it_is_the_address_nginx_named():
    assert client_ip(_request(**{"x-client-ip": "203.0.113.7"})) == "203.0.113.7"


def test_an_ipv6_address_is_written_one_way_however_it_arrived():
    assert client_ip(_request(**{"x-client-ip": " 2001:DB8:0:0::1 "})) == "2001:db8::1"


def test_x_forwarded_for_is_nginx_s_to_read_not_the_backend_s():
    """nginx already worked the client out from it; read here as well, it would be a second answer."""
    assert client_ip(_request(**{"x-forwarded-for": "198.51.100.9"})) == "172.20.0.5"


@pytest.mark.parametrize("named", ["", "not-an-address", "203.0.113.7, 198.51.100.9"])
def test_without_an_address_named_it_is_whoever_connected(named):
    assert client_ip(_request(**{"x-client-ip": named})) == "172.20.0.5"


def test_without_the_header_at_all_it_is_whoever_connected():
    assert client_ip(_request()) == "172.20.0.5"


def test_with_nobody_recorded_at_all_it_is_empty():
    assert client_ip(_request(remote_addr=None)) == ""


def test_allauth_counts_against_the_same_address():
    assert get_adapter().get_client_ip(_request(**{"x-client-ip": "203.0.113.7"})) == "203.0.113.7"


def test_allauth_refuses_a_request_from_nobody_as_its_own_adapter_does():
    """Its rate limits key on the address, and one shared by every request without one is no limit."""
    with pytest.raises(PermissionDenied, match="^Unable to determine client IP address$"):
        get_adapter().get_client_ip(_request(remote_addr=None))
