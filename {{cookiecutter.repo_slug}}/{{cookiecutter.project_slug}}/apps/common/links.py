"""Every URL reversed here names its host. The API's urlconf is also ROOT_URLCONF, so a bare reverse() answers
for the API whatever was meant, and the auth and admin hosts each mount names the others don't."""

from django.urls import reverse
from django_hosts.resolvers import get_host


def _on(host, name, args, kwargs):
    return reverse(name, urlconf=get_host(host).urlconf, args=args, kwargs=kwargs)


def api_path(name, *args, **kwargs):
    """A path on api.<domain>."""
    return _on("api", name, args, kwargs)


def auth_path(name, *args, **kwargs):
    """A path on auth.<domain>."""
    return _on("auth", name, args, kwargs)


def admin_path(name, *args, **kwargs):
    """A path on admin.<domain>."""
    return _on("admin", name, args, kwargs)
