"""What the published documents must be true about, before anything is typed against them.

`packages/api/src/schema.ts` is generated from the api document and `packages/auth-api` is written
against the auth one, so a document that is wrong here fails much later, as a frontend call that
cannot type-check or cannot reach its endpoint.
"""

import json
from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.urls import get_urlconf, set_urlconf
from django_hosts.resolvers import clear_host_caches, get_host
from drf_spectacular.drainage import GENERATOR_STATS, warn

from apps.common import openapi
from apps.core.management.commands import openapi_document


DOCUMENTS = [openapi.api_document, openapi.auth_document]
REF = "#/components/"


def _refs(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str) and value.startswith(REF):
                yield value.removeprefix(REF)
            else:
                yield from _refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from _refs(value)


def test_the_api_generator_reports_nothing():
    """Asked of the generator because the document cannot answer it: two components claiming one
    name arrive as a dropped or hashed component rather than a duplicate key, so what is published
    looks correct. Private, because the public surface is a bool and a failure that cannot name the
    warning is one somebody silences."""
    openapi.api_document()

    assert dict(GENERATOR_STATS._warn_cache) == {}
    assert dict(GENERATOR_STATS._error_cache) == {}


@pytest.mark.parametrize("build", DOCUMENTS, ids=lambda build: build.__name__)
def test_every_component_a_document_names_is_defined(build):
    document = build()

    components = document["components"]
    missing = sorted(
        ref for ref in set(_refs(document)) if ref.partition("/")[2] not in components.get(ref.partition("/")[0], {})
    )

    assert missing == [], f"these are referred to and never defined: {missing}"


def test_the_ref_walk_finds_what_it_is_looking_for():
    """The guard, guarded: a walk that found nothing would pass every document above."""
    document = {"paths": {"/x": {"get": [{"$ref": "#/components/schemas/A"}, {"$ref": "elsewhere"}]}}}

    assert list(_refs(document)) == ["schemas/A"]


def test_the_api_document_names_an_enum_for_the_field_that_owns_it():
    schemas = openapi.api_document()["components"]["schemas"]

    assert "UserLanguage" in schemas
    assert "LanguageEnum" not in schemas


def test_the_api_document_carries_routes_only_a_signed_in_user_may_call():
    assert "/v0/users/me/" in openapi.api_document()["paths"]


def test_the_api_document_leaves_out_the_schema_endpoint():
    assert not any("/schema/" in path for path in openapi.api_document()["paths"])


def test_every_auth_path_is_one_a_request_reaches():
    """allauth templates its paths over `{client}`; the client is written against concrete ones."""
    paths = openapi.auth_document()["paths"]

    assert not [path for path in paths if "{client}" in path]
    assert {"/v0/browser/v1/auth/session", "/v0/app/v1/auth/session"} <= paths.keys()


def test_each_client_gets_its_own_copy_of_a_path():
    paths = openapi.auth_document()["paths"]

    assert paths["/v0/browser/v1/auth/session"] is not paths["/v0/app/v1/auth/session"]


def test_the_client_parameter_is_gone_with_the_template():
    document = openapi.auth_document()

    assert "Client" not in document["components"].get("parameters", {})
    assert "parameters/Client" not in set(_refs(document))


def test_a_path_mounted_for_one_client_only_is_expanded_for_that_one():
    """The app's token refresh has no browser twin, and is still checked when templated."""
    paths = dict(openapi._concrete_paths({"/v0/{client}/v1/tokens/refresh": {}}, get_host("auth").urlconf))

    assert list(paths) == ["/v0/app/v1/tokens/refresh"]


def test_an_already_concrete_path_is_kept_as_it_is():
    item = {"get": {}}

    assert dict(openapi._concrete_paths({"/v0/browser/v1/x": item}, get_host("auth").urlconf)) == {
        "/v0/browser/v1/x": item
    }


def test_the_client_parameter_is_dropped_wherever_it_is_declared():
    other = {"$ref": "#/components/parameters/Other"}
    item = {
        "parameters": [openapi.CLIENT_PARAMETER, other],
        "summary": "Not an operation.",
        "get": {"parameters": [openapi.CLIENT_PARAMETER]},
        "post": {"responses": {}},
    }

    assert openapi._without_client_parameter(item) == {
        "parameters": [other],
        "summary": "Not an operation.",
        "get": {},
        "post": {"responses": {}},
    }


def test_the_api_document_is_built_from_the_api_host_whatever_the_default(settings):
    """Named rather than left to ROOT_URLCONF, which only happens to be the api host's urlconf."""
    settings.ROOT_URLCONF = get_host("auth").urlconf
    settings.DEFAULT_HOST = "auth"
    clear_host_caches()
    try:
        assert "/v0/users/me/" in openapi.api_document()["paths"]
    finally:
        clear_host_caches()


def test_a_document_declaring_no_parameters_needs_none_removed(monkeypatch):
    monkeypatch.setattr(openapi, "get_schema", lambda: {"paths": {}, "components": {}})

    assert openapi.auth_document() == {"paths": {}, "components": {}}


def test_the_auth_document_leaves_the_current_urlconf_as_it_found_it():
    api = get_host("api").urlconf
    set_urlconf(api)
    try:
        openapi.auth_document()
        assert get_urlconf() == api
    finally:
        set_urlconf(None)


@pytest.mark.parametrize("name", sorted(openapi_document.DOCUMENTS))
def test_the_command_prints_the_document(name):
    out = StringIO()

    call_command("openapi_document", name, stdout=out)

    built = json.dumps(openapi_document.DOCUMENTS[name]()["paths"], default=str)
    # Paths rather than the whole document: allauth's example user carries a fresh uuid every build.
    assert json.loads(out.getvalue())["paths"] == json.loads(built)


def test_the_command_fails_on_a_generator_warning(monkeypatch):
    def warns():
        warn("two components want one name")
        return {}

    monkeypatch.setitem(openapi_document.DOCUMENTS, "api", warns)
    try:
        with pytest.raises(CommandError, match="^Generating the api document emitted warnings; see above.$"):
            call_command("openapi_document", "api", stdout=StringIO())
    finally:
        GENERATOR_STATS.reset()


def test_the_command_only_knows_its_two_documents():
    with pytest.raises(CommandError, match="invalid choice"):
        call_command("openapi_document", "admin", stdout=StringIO())
