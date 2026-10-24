"""DRF's throttles keyed on nginx's client IP: DRF's own X-Forwarded-For reading sees the frontend's
address on every page it renders."""

import ipaddress

from rest_framework import throttling

from apps.common.client_ip import client_ip


# One IPv6 subscriber gets a whole /64; matches ALLAUTH_RATE_LIMIT_IPV6_PREFIX.
IPV6_PREFIX = 64


class ClientIdentity:
    def get_ident(self, request):
        ip = client_ip(request)
        try:
            address = ipaddress.ip_address(ip)
        except ValueError:
            return ip
        if address.version == 6:
            return str(ipaddress.IPv6Network(address).supernet(new_prefix=IPV6_PREFIX).network_address)
        return ip


class AnonymousRateThrottle(ClientIdentity, throttling.AnonRateThrottle):
    pass


class UserRateThrottle(ClientIdentity, throttling.UserRateThrottle):
    pass


class ScopedRateThrottle(ClientIdentity, throttling.ScopedRateThrottle):
    pass
