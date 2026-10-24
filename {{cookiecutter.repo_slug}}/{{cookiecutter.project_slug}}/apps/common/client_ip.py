"""Whose request this is, as nginx worked it out."""

import ipaddress


# nginx sets it over whatever the client sent (template.nginx.conf's $client_ip).
CLIENT_IP_HEADER = "X-Client-Ip"


def client_ip(request) -> str:
    """Trusted outright: nothing but nginx reaches the backend, and nginx overwrites the header."""
    try:
        return str(ipaddress.ip_address(request.headers[CLIENT_IP_HEADER].strip()))
    except (KeyError, ValueError):
        return request.META.get("REMOTE_ADDR", "")
