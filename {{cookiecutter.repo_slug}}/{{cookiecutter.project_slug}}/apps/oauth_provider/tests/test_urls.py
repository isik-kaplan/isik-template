import pytest

from apps.oauth_provider.tests.conftest import auth_host, o


ENDPOINTS = [
    "authorize",
    "device-authorization",
    "token",
    "revoke-token",
    "oidc-connect-discovery-info",
    "jwks-info",
    "user-info",
]


@pytest.mark.django_db
@pytest.mark.parametrize("name", [*ENDPOINTS, "oauth-server-metadata"])
def test_nothing_of_the_provider_answers_while_it_is_off(client, settings, name):
    settings.OAUTH_PROVIDER_MODE = "off"

    assert client.get(o(name), HTTP_HOST=auth_host()).status_code == 404


@pytest.mark.django_db
def test_the_discovery_document_names_this_issuer_and_its_endpoints(client, provider):
    response = client.get(o("oidc-connect-discovery-info"), HTTP_HOST=auth_host())

    assert response.status_code == 200
    document = response.json()
    assert document["issuer"] == f"http://{auth_host()}/o"
    assert document["authorization_endpoint"] == f"http://{auth_host()}/o/authorize/"
    assert document["scopes_supported"] == ["openid", "profile", "email"]


@pytest.mark.django_db
def test_the_signing_key_is_published(client, provider):
    keys = client.get(o("jwks-info"), HTTP_HOST=auth_host()).json()["keys"]

    assert [key["alg"] for key in keys] == ["RS256"]


def test_a_served_route_hands_its_view_everything_the_url_captured(settings):
    from apps.oauth_provider.urls import served_while_on

    settings.OAUTH_PROVIDER_MODE = "public"

    def view(request, *args, **kwargs):
        return (request, args, kwargs)

    assert served_while_on(view)("the-request", "a", b="c") == ("the-request", ("a",), {"b": "c"})


@pytest.mark.parametrize(
    "name",
    ["device", "device-confirm", "dcr-register", "introspect", "register", "list", "authorized-token-list"],
)
def test_the_flows_this_provider_does_not_offer_are_not_routed(name):
    from django.urls import NoReverseMatch

    with pytest.raises(NoReverseMatch):
        o(name)
