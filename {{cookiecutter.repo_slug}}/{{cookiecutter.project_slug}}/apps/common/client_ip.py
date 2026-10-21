"""Whose request this is, as nginx worked it out."""

import ipaddress


# Set by nginx on every request it passes on, over whatever the client sent (template.nginx.conf's
# $client_ip): the address TRUSTED_PROXY_COUNT points at in X-Forwarded-For, or, for a fetch the
# frontend makes while rendering a page, the visitor it renders for.
CLIENT_IP_HEADER = "X-Client-Ip"


def client_ip(request) -> str:
    """The address rate limits count against and the request log records.

    The header is trusted outright because nothing but nginx reaches the backend: no port is
    published, and nginx overwrites it. Without one (a test client, a shell) it is REMOTE_ADDR, and
    an address nobody recorded is empty.
    """
    try:
        return str(ipaddress.ip_address(request.headers[CLIENT_IP_HEADER].strip()))
    except (KeyError, ValueError):
        return request.META.get("REMOTE_ADDR", "")
