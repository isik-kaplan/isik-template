from types import SimpleNamespace

import pytest

from apps.common.api.token_actions import takes_a_token
from apps.common.openapi import api_document


@pytest.mark.parametrize(
    ("view", "takes"),
    [
        (SimpleNamespace(action="list", token_actions=frozenset({"list", "retrieve"})), True),
        (SimpleNamespace(action="create", token_actions=frozenset({"list"})), False),
        (SimpleNamespace(action="list"), False),
        (SimpleNamespace(action=None, token_actions=frozenset({"list"})), False),
        # Not a viewset at all: no action to name.
        (object(), False),
    ],
)
def test_a_view_takes_a_token_only_for_the_actions_it_names(view, takes):
    assert takes_a_token(view) is takes


def test_the_api_document_describes_both_kinds_of_token():
    schemes = api_document()["components"]["securitySchemes"]

    assert schemes["applicationToken"] == {
        "type": "http",
        "scheme": "bearer",
        "description": (
            "An access token an application was given at the authorization server's /o/token/, acting for "
            "whoever let it in and only within the scopes they let it have."
        ),
    }
    assert schemes["personalAccessToken"] == {
        "type": "http",
        "scheme": "bearer",
        "description": (
            "A personal access token somebody made for themselves on their profile, acting as them within "
            "the scopes they gave it."
        ),
    }


def _security(path, method="get"):
    return api_document()["paths"][path][method].get("security", [])


def test_an_operation_that_takes_a_token_says_so_for_both_kinds():
    assert {"applicationToken": []} in _security("/v0/users/")
    assert {"personalAccessToken": []} in _security("/v0/users/")


def test_an_operation_closed_to_tokens_names_neither():
    security = _security("/v0/users/me/")

    assert {"applicationToken": []} not in security
    assert {"personalAccessToken": []} not in security
