"""The DRF and allauth documents the frontend clients are written against.

allauth templates every path over `{client}`; it is expanded into the concrete paths a request reaches.
"""

from copy import deepcopy

from allauth.headless import app_settings as headless_settings

# What allauth's own openapi.json view calls; there is no public name for it.
from allauth.headless.spec.internal.schema import get_schema
from django.urls import Resolver404, get_urlconf, resolve, set_urlconf
from django_hosts.resolvers import get_host
from drf_spectacular.generators import SchemaGenerator


CLIENT_PARAMETER = {"$ref": "#/components/parameters/Client"}


def api_document():
    # public=True: with no request, a permission-gated route such as `users/me/` would be left out.
    return SchemaGenerator(urlconf=get_host("api").urlconf).get_schema(public=True)


def auth_document():
    urlconf = get_host("auth").urlconf
    previous = get_urlconf()
    # allauth resolves against the current urlconf, which outside a request is the api host's.
    set_urlconf(urlconf)
    try:
        document = get_schema()
    finally:
        set_urlconf(previous)
    document["paths"] = dict(_concrete_paths(document["paths"], urlconf))
    document["components"].get("parameters", {}).pop("Client", None)
    return document


def _concrete_paths(paths, urlconf):
    for path, item in paths.items():
        if "{client}" not in path:
            yield path, item
            continue
        for client in headless_settings.CLIENTS:
            concrete = path.replace("{client}", client)
            try:
                resolve(concrete, urlconf=urlconf)
            except Resolver404:
                # Mounted for one client only, such as the app's token refresh.
                continue
            yield concrete, _without_client_parameter(deepcopy(item))


def _without_client_parameter(item):
    for owner in (item, *(operation for operation in item.values() if isinstance(operation, dict))):
        parameters = [parameter for parameter in owner.get("parameters", ()) if parameter != CLIENT_PARAMETER]
        if parameters:
            owner["parameters"] = parameters
        else:
            owner.pop("parameters", None)
    return item
