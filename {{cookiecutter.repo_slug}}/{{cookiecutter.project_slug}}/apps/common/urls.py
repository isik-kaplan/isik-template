"""Every view callable the project routes, for the checks that judge what a callable carries.

isik's `routed_views()` answers with view classes, while a decorator applied to `as_view()` in a
urlconf (`not_atomic(...)`, say) leaves its mark on the callable alone.
"""

from django.urls import get_resolver
from isik.django.apps.common.urlconfs import project_urlconfs


def routed_callbacks():
    """Every view callable reachable through any urlconf the project serves, nested `include()`s too."""
    for urlconf in project_urlconfs():
        yield from _callbacks(get_resolver(urlconf))


def _callbacks(resolver):
    for entry in resolver.url_patterns:
        if hasattr(entry, "url_patterns"):
            yield from _callbacks(entry)
        else:
            yield entry.callback
