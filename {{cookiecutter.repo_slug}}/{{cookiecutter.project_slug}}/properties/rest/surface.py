"""Which operations a host answers, read off its resolver.

Not off the OpenAPI document: generating it at collection time races across xdist workers, which
then disagree about which tests exist. The resolver is in memory, the same in every worker, and what
the document is built from anyway.
"""

import re

from django.urls import URLResolver, get_resolver
from django_hosts.resolvers import get_host


ARGUMENT = r"\(\?P<(\w+)>[^)]*\)|<(?:\w+:)?(\w+)>"


def _walk(patterns, prefix=""):
    for entry in patterns:
        route = prefix + str(entry.pattern)
        if isinstance(entry, URLResolver):
            yield from _walk(entry.url_patterns, route)
        else:
            # DRF's routers write anchored regexes; the URL is what sits between the anchors.
            yield route.replace("^", "").replace("$", ""), entry


def _answers(entry, method):
    view = entry.callback
    # DRF's viewsets name their actions; any other class-based view names the methods it answers.
    cls = getattr(view, "cls", None) or getattr(view, "view_class", None)
    handlers = getattr(view, "actions", None) or getattr(cls, "http_method_names", None)
    return handlers is not None and method in set(handlers)


def _routes(host, method):
    for route, entry in _walk(get_resolver(get_host(host).urlconf).url_patterns):
        # `\.` is DRF's format suffix, whose argument is `format`, not a row.
        if "\\." not in route and _answers(entry, method):
            yield route, [first or second for first, second in re.findall(ARGUMENT, route)]


def operations(host, method):
    """Every path on `host` that answers `method` and takes no argument."""
    return sorted({"/" + route.lstrip("/") for route, names in _routes(host, method) if not names})


def detail_operations(host, method):
    """Every path on `host` that answers `method` and takes one argument, written with it as `{pk}`."""
    return sorted(
        {"/" + re.sub(ARGUMENT, "{pk}", route).lstrip("/") for route, names in _routes(host, method) if len(names) == 1}
    )
