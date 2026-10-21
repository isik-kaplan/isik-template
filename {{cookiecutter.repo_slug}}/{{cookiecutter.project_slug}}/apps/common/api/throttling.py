"""DRF's throttles, counting against the client nginx worked out rather than DRF's own reading of
X-Forwarded-For, which would see the frontend's address on every page it renders.

The counts live in the default cache, which every process and container shares - see CACHES in
settings.py. A view stricter than the defaults names a rate in REST_FRAMEWORK's
DEFAULT_THROTTLE_RATES and says `throttle_scope = "<that name>"`.
"""

import ipaddress

from rest_framework import throttling

from apps.common.client_ip import client_ip


# One IPv6 subscriber is handed a whole /64, so an address inside it costs nothing to change.
# allauth's limits count the same way (ALLAUTH_RATE_LIMIT_IPV6_PREFIX).
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
    """Anybody not signed in, per address."""


class UserRateThrottle(ClientIdentity, throttling.UserRateThrottle):
    """Somebody signed in, per account, wherever they are."""


class ScopedRateThrottle(ClientIdentity, throttling.ScopedRateThrottle):
    """A view's own `throttle_scope`, per account or, signed out, per address."""
