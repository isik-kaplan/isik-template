import pytest
from django.test import Client
from django.urls import reverse
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.oauth_provider.authentication import ApplicationTokenAuthentication
from apps.oauth_provider.tests.conftest import permission, set_approval, tokens_for
from apps.users.models.user import User


USERS = reverse("users-list")


@pytest.fixture
def bob(db):
    return User.objects.create_user(username="bob")


def _as_the_application(path, access_token):
    """A request from the application's own server: the bearer token and nothing else - no session."""
    return Client().get(path, HTTP_AUTHORIZATION=f"Bearer {access_token}")


def _usernames(response):
    return [row["username"] for row in response.json()["results"]]


@pytest.fixture
def manager(signed_in):
    signed_in.user_permissions.add(permission("users:manage:user"))
    return signed_in


@pytest.mark.django_db
def test_an_application_acts_with_a_permission_both_its_person_and_its_token_hold(
    client, provider, application, manager, bob
):
    tokens = tokens_for(client, application, scope="openid users:manage:user")

    assert _usernames(_as_the_application(USERS, tokens["access_token"])) == ["alice", "bob"]


@pytest.mark.django_db
def test_a_permission_its_person_holds_is_not_the_applications_unless_they_let_it_have_it(
    client, provider, application, manager, bob
):
    tokens = tokens_for(client, application, scope="openid")

    assert _usernames(_as_the_application(USERS, tokens["access_token"])) == ["alice"]


@pytest.mark.django_db
def test_a_permission_its_token_holds_is_nothing_if_its_person_does_not_hold_it(
    client, provider, application, signed_in, bob
):
    tokens = tokens_for(client, application, scope="openid users:manage:user")

    assert _usernames(_as_the_application(USERS, tokens["access_token"])) == ["alice"]


@pytest.mark.django_db
@pytest.mark.parametrize("rank", ["is_staff", "is_superuser"])
def test_a_rank_is_never_an_applications_to_act_with(client, provider, application, signed_in, bob, rank):
    setattr(signed_in, rank, True)
    signed_in.save()
    tokens = tokens_for(client, application, scope="openid")

    assert _usernames(_as_the_application(USERS, tokens["access_token"])) == ["alice"]


@pytest.mark.django_db
def test_a_superusers_application_holds_what_it_was_let_have(client, provider, application, signed_in, bob):
    signed_in.is_superuser = True
    signed_in.save()
    tokens = tokens_for(client, application, scope="openid users:manage:user")

    assert _usernames(_as_the_application(USERS, tokens["access_token"])) == ["alice", "bob"]


@pytest.mark.django_db
def test_a_scope_withdrawn_from_the_application_since_is_gone_from_its_tokens_too(
    client, provider, application, manager, bob
):
    tokens = tokens_for(client, application, scope="openid users:manage:user")
    application.approved_scopes.clear()

    assert _usernames(_as_the_application(USERS, tokens["access_token"])) == ["alice"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path", [reverse("users-me"), reverse("oauth-applications-list"), reverse("authorized-applications-list")]
)
def test_an_application_reaches_only_what_says_it_may(client, provider, application, signed_in, path):
    tokens = tokens_for(client, application)

    response = _as_the_application(path, tokens["access_token"])

    assert response.status_code == 403
    assert response.json()["detail"] == "Applications cannot do this on anybody's behalf."


@pytest.mark.django_db
def test_nothing_is_an_applications_while_the_provider_is_off(client, provider, application, manager, settings):
    tokens = tokens_for(client, application, scope="openid users:manage:user")
    settings.OAUTH_PROVIDER_MODE = "off"

    assert _as_the_application(USERS, tokens["access_token"]).status_code == 403


@pytest.mark.django_db
def test_a_token_from_an_application_taken_down_is_nobodys(client, provider, application, manager):
    tokens = tokens_for(client, application, scope="openid users:manage:user")
    set_approval(application, "withdrawn")

    assert _as_the_application(USERS, tokens["access_token"]).status_code == 403


@pytest.mark.django_db
def test_a_token_nobody_issued_is_nobodys(provider, signed_in):
    assert _as_the_application(USERS, "not-a-token").status_code == 403


@pytest.mark.django_db
def test_another_kind_of_authorization_is_left_to_the_others(client, signed_in):
    """A session goes on working beside an Authorization header that is not a bearer token."""
    assert client.get(USERS, HTTP_AUTHORIZATION="Basic Zm9vOmJhcg==").status_code == 200


@pytest.mark.django_db
def test_a_request_with_no_token_is_left_to_the_others(provider):
    request = Request(APIRequestFactory().get(USERS))

    assert ApplicationTokenAuthentication().authenticate(request) is None
