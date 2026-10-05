"""The two documents the frontend's typed clients are written against, built the one way both the
contract tests and `manage.py openapi_document` read them.

`packages/api` is generated from the DRF document. `packages/auth-api` is written by hand against
allauth's headless one, which templates every path over `{client}` - expanded here into the concrete
browser/app paths a request actually reaches, since that is the shape the client is written in.
"""

from copy import deepcopy

from allauth.headless import app_settings as headless_settings

# What allauth's own served openapi.json view calls; there is no public name for it.
from allauth.headless.spec.internal.schema import get_schema
from django.urls import Resolver404, get_urlconf, resolve, set_urlconf
from django_hosts.resolvers import get_host
from drf_spectacular.generators import SchemaGenerator


CLIENT_PARAMETER = {"$ref": "#/components/parameters/Client"}


def api_document():
    # public=True: with no request to judge, a permission-gated route such as `users/me/` would
    # otherwise be left out of the document and of the client generated from it.
    return SchemaGenerator(urlconf=get_host("api").urlconf).get_schema(public=True)


def auth_document():
    urlconf = get_host("auth").urlconf
    previous = get_urlconf()
    # allauth reverses and resolves its own paths against whatever urlconf is current, which outside
    # a request is ROOT_URLCONF - the api host, where none of them exist.
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
                # An endpoint allauth mounts for one client only, such as the app's token refresh.
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
