"""Walking every urlconf this deployment serves, for the checks that judge what is actually routed.

A Django check is handed `ROOT_URLCONF` alone, while django-hosts mounts a urlconf per subdomain - so
anything asking "what does this project really serve" has to find them itself.
"""

from django.conf import settings
from django.urls import get_resolver
from django_hosts.resolvers import get_host_patterns


def every_urlconf():
    """Each urlconf a host pattern mounts, plus the fallback one, once each, in a stable order."""
    return sorted({settings.ROOT_URLCONF, *(host.urlconf for host in get_host_patterns())})


def routed_callbacks():
    """Every view callable reachable through any of them, including nested `include()`s."""
    for urlconf in every_urlconf():
        yield from _callbacks(get_resolver(urlconf))


def _callbacks(resolver):
    for entry in resolver.url_patterns:
        if hasattr(entry, "url_patterns"):
            yield from _callbacks(entry)
        else:
            yield entry.callback
