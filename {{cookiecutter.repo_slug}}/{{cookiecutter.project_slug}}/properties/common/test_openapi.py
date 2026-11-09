"""The published documents: every path in them is one a request reaches, with no `{client}` left over."""

import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.urls import resolve
from django_hosts.resolvers import get_host
from hypothesis import given
from hypothesis import strategies as st

from apps.common import openapi
from apps.core.management.commands.openapi_document import DOCUMENTS


@pytest.fixture
def printed(request):
    out = StringIO()
    call_command("openapi_document", request.param, stdout=out)
    return request.param, json.loads(out.getvalue())


# Every path, not a drawn one: a host whose drawn paths all filled in would leave the rest unchecked.
@pytest.mark.parametrize("printed", sorted(DOCUMENTS), indirect=True)
def test_every_printed_path_resolves_on_its_own_host(printed):
    host, document = printed
    for path in sorted(document["paths"]):
        assert "{client}" not in path
        # A templated id resolves once filled in with anything the converter accepts.
        concrete = path.replace("{id}", "1").replace("{key}", "k")
        if "{" not in concrete:
            resolve(concrete, urlconf=get_host(host).urlconf)


@pytest.mark.parametrize("printed", ["auth"], indirect=True)
@given(data=st.data())
def test_no_printed_auth_operation_still_takes_the_client_parameter(printed, data):
    _, document = printed
    item = document["paths"][data.draw(st.sampled_from(sorted(document["paths"])))]

    for owner in (item, *(operation for operation in item.values() if isinstance(operation, dict))):
        assert openapi.CLIENT_PARAMETER not in owner.get("parameters", [])
    assert "Client" not in document["components"].get("parameters", {})


PARAMETER = st.builds(lambda name: {"$ref": f"#/components/parameters/{name}"}, st.sampled_from(["Client", "A", "B"]))
OPERATION = st.fixed_dictionaries({}, optional={"parameters": st.lists(PARAMETER, max_size=3)})


@given(
    parameters=st.lists(PARAMETER, max_size=3),
    operations=st.dictionaries(st.sampled_from(["get", "post", "delete"]), OPERATION, max_size=3),
)
def test_dropping_the_client_parameter_keeps_every_other_one_in_order(parameters, operations):
    item = {"parameters": parameters, "summary": "kept", **operations}
    before = json.loads(json.dumps(item))

    stripped = openapi._without_client_parameter(item)

    for key, owner in [(None, before), *((name, op) for name, op in before.items() if isinstance(op, dict))]:
        after = stripped if key is None else stripped[key]
        kept = [parameter for parameter in owner.get("parameters", []) if parameter != openapi.CLIENT_PARAMETER]
        assert after.get("parameters", []) == kept
        assert ("parameters" in after) is bool(kept)
    assert stripped["summary"] == "kept"


@given(tail=st.sampled_from(["auth/session", "tokens/refresh", "no/such/route"]))
def test_a_templated_auth_path_expands_only_to_the_clients_that_mount_it(tail):
    urlconf = get_host("auth").urlconf
    expanded = dict(openapi._concrete_paths({"/v0/" + "{client}/" + tail: {"get": {}}}, urlconf))

    for path in expanded:
        resolve(path, urlconf=urlconf)
    assert all("{client}" not in path for path in expanded)
