from datetime import timedelta

import pytest
from django.utils import timezone
from oauth2_provider.models import get_access_token_model, get_application_model

from apps.common.links import api_path
from apps.oauth_provider.api.viewsets.reviewed_application import ReviewedApplicationViewSet
from apps.oauth_provider.tests.conftest import REDIRECT_URI, make_application, permission, set_approval
from apps.users.models.user import User
from apps.users.permissions import Permission
from conftest import versioned


AccessToken = get_access_token_model()
Application = get_application_model()

LIST = api_path("oauth_provider:application-reviews-list")
MANAGE = str(Permission.USERS_MANAGE_USER)
GRANT = str(Permission.USERS_GRANT_RIGHTS)


def _detail(application):
    return api_path("oauth_provider:application-reviews-detail", application.pk)


def _action(application, name):
    return api_path(f"oauth_provider:application-reviews-{name}", application.pk)


@pytest.fixture
def superuser(signed_in):
    signed_in.is_superuser = True
    signed_in.save()
    return signed_in


@pytest.fixture
def reviewer(superuser, headless, provider):
    headless.prove()
    return superuser


@pytest.fixture
def pending(db, alice):
    application = make_application(
        name="Bob's Planner",
        user=User.objects.create_user(email="bob@example.test", username="bob"),
        client_type=Application.CLIENT_PUBLIC,
        authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE,
        redirect_uris=REDIRECT_URI,
    )
    application.requested_scopes.set([permission(MANAGE), permission(GRANT)])
    return application


@pytest.mark.django_db
@pytest.mark.parametrize("staff", [False, True])
def test_only_a_superuser_reviews_applications(client, signed_in, provider, staff):
    signed_in.is_staff = staff
    signed_in.save()

    response = client.get(LIST)

    assert response.status_code == 403
    assert response.json()["detail"] == "Only a superuser reviews applications."


@pytest.mark.django_db
def test_nobody_reviews_while_the_provider_is_off(client, superuser, settings):
    settings.OAUTH_PROVIDER_MODE = "off"

    assert client.get(LIST).status_code == 403


@pytest.mark.django_db
def test_every_application_is_listed_waiting_ones_first_then_oldest_first(
    client, superuser, provider, application, pending
):
    newest = make_application(name="Newest", user=superuser)
    set_approval(newest, "approved")

    rows = client.get(LIST).json()["results"]

    assert [row["name"] for row in rows] == ["Bob's Planner", "Acme Notes", "Newest"]
    assert rows[0] == {
        "id": pending.pk,
        "name": "Bob's Planner",
        "description": "",
        "client_id": pending.client_id,
        "client_type": "public",
        "authorization_grant_type": "authorization-code",
        "redirect_uris": [REDIRECT_URI],
        "approval": "pending",
        "owner": "bob",
        "requested_scopes": [GRANT, MANAGE],
        "approved_scopes": [],
        "created": rows[0]["created"],
        "updated": rows[0]["updated"],
    }


@pytest.mark.django_db
def test_the_queue_can_be_narrowed_to_one_state(client, superuser, provider, application, pending):
    rows = client.get(LIST, {"approval": "pending"}).json()["results"]

    assert [row["name"] for row in rows] == ["Bob's Planner"]


@pytest.mark.django_db
def test_approving_lets_it_ask_for_what_was_approved(client, reviewer, pending):
    response = client.post(
        _action(pending, "approve"),
        {"approved_scopes": [MANAGE]},
        content_type="application/json",
        headers=versioned(pending),
    )

    assert response.status_code == 200
    assert response.json()["approval"] == "approved"
    assert response.json()["approved_scopes"] == [MANAGE]


@pytest.mark.django_db
def test_approving_for_everything_it_asked_for_is_an_answer_too(client, reviewer, pending):
    response = client.post(
        _action(pending, "approve"),
        {"approved_scopes": [GRANT, MANAGE]},
        content_type="application/json",
        headers=versioned(pending),
    )

    assert response.json()["approved_scopes"] == [GRANT, MANAGE]


@pytest.mark.django_db
def test_approving_for_nothing_beyond_signing_people_in_is_an_answer_too(client, reviewer, pending):
    response = client.post(
        _action(pending, "approve"),
        {"approved_scopes": []},
        content_type="application/json",
        headers=versioned(pending),
    )

    assert response.json()["approval"] == "approved"
    assert response.json()["approved_scopes"] == []


@pytest.mark.django_db
def test_nothing_it_did_not_ask_for_is_approved(client, reviewer, pending):
    pending.requested_scopes.set([permission(MANAGE)])

    response = client.post(
        _action(pending, "approve"),
        {"approved_scopes": [GRANT]},
        content_type="application/json",
        headers=versioned(pending),
    )

    assert response.status_code == 400
    assert response.json() == {
        "approved_scopes": [
            {"message": "An application cannot be approved for a scope it never asked for.", "code": "invalid"}
        ]
    }


@pytest.mark.django_db
def test_approving_needs_a_proof(client, superuser, provider, pending):
    response = client.post(
        _action(pending, "approve"),
        {"approved_scopes": []},
        content_type="application/json",
        headers=versioned(pending),
    )

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"


@pytest.mark.django_db
def test_a_withdrawn_application_is_reinstated_by_approving_it_again(client, reviewer, application):
    set_approval(application, "withdrawn")

    response = client.post(
        _action(application, "approve"),
        {"approved_scopes": []},
        content_type="application/json",
        headers=versioned(application),
    )

    assert response.json()["approval"] == "approved"


@pytest.mark.django_db
def test_one_its_owner_switched_off_is_theirs_to_switch_back_on(client, reviewer, application):
    set_approval(application, "disabled")

    response = client.post(
        _action(application, "approve"),
        {"approved_scopes": []},
        content_type="application/json",
        headers=versioned(application),
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Its owner switched it off; switching it back on is theirs to do.",
        "code": "switched_off_by_owner",
    }


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "approved", "disabled"])
def test_withdrawing_takes_it_down_and_every_token_it_holds_with_no_proof(
    client, superuser, provider, application, approval
):
    set_approval(application, approval)
    token = AccessToken.objects.create(
        user=superuser, application=application, token="t", expires=timezone.now() + timedelta(hours=1)
    )

    response = client.post(_action(application, "withdraw"))

    assert response.json()["approval"] == "withdrawn"
    assert not AccessToken.objects.filter(pk=token.pk).exists()


@pytest.mark.django_db
def test_withdrawing_twice_says_so(client, superuser, provider, application):
    set_approval(application, "withdrawn")

    response = client.post(_action(application, "withdraw"))

    assert response.status_code == 400
    assert response.json() == {"detail": "It is already withdrawn.", "code": "already_withdrawn"}


@pytest.mark.django_db
def test_a_superuser_reviews_here_and_does_not_author(client, reviewer):
    response = client.post(LIST, {"name": "Mine"}, content_type="application/json")

    assert response.status_code == 405
    assert response.json()["detail"] == 'Method "POST" not allowed.'
    assert not Application.objects.exists()


@pytest.mark.django_db
def test_one_application_is_read_by_its_id(client, superuser, provider, pending):
    assert client.get(_detail(pending)).json()["owner"] == "bob"


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["withdrawn", "disabled"])
def test_one_signing_nobody_in_is_deleted_with_its_tokens(client, reviewer, application, approval):
    set_approval(application, approval)
    token = AccessToken.objects.create(
        user=reviewer, application=application, token="t", expires=timezone.now() + timedelta(hours=1)
    )

    response = client.delete(_detail(application), headers=versioned(application))

    assert response.status_code == 204
    assert not Application.objects.filter(pk=application.pk).exists()
    assert not AccessToken.objects.filter(pk=token.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "approved"])
def test_one_that_may_still_sign_people_in_is_withdrawn_before_it_is_deleted(
    client, superuser, provider, application, approval
):
    """Said before asking for a proof the delete would not use."""
    set_approval(application, approval)

    response = client.delete(_detail(application), headers=versioned(application))

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Withdraw it first: deleting it is for an application nobody is using any more.",
        "code": "withdraw_first",
    }
    assert Application.objects.filter(pk=application.pk).exists()


@pytest.mark.django_db
def test_deleting_needs_a_proof(client, superuser, provider, application):
    set_approval(application, "withdrawn")

    response = client.delete(_detail(application), headers=versioned(application))

    assert response.status_code == 403
    assert response["X-Reauthentication-Required"] == "1"


@pytest.mark.django_db
def test_an_id_that_is_no_number_is_simply_not_found(client, reviewer):
    assert client.delete(api_path("oauth_provider:application-reviews-detail", "nope")).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("approval", ["pending", "approved"])
def test_the_delete_holds_even_once_proved(client, reviewer, application, approval, monkeypatch):
    """perform_destroy checks again, in case the state moved between the early refusal and the delete."""
    set_approval(application, approval)
    monkeypatch.setattr(ReviewedApplicationViewSet, "refuse_before_proving", lambda self, request: None)

    response = client.delete(_detail(application), headers=versioned(application))

    assert (response.status_code, response.json()["code"]) == (400, "withdraw_first")
