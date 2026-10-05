import uuid

import pytest
from django.conf import settings

from apps.users.headless import EXAMPLE_USER_ID
from apps.users.models.user import User


@pytest.mark.django_db
def test_session_endpoint_reports_anonymous(client):
    response = client.get("/v0/browser/v1/auth/session", HTTP_HOST=f"auth.{settings.PARENT_HOST}")
    assert response.status_code == 401
    assert response.json()["meta"]["is_authenticated"] is False


@pytest.mark.django_db
def test_signup_via_headless_api_leaves_email_verification_pending(client):
    host = f"auth.{settings.PARENT_HOST}"
    # Primes the csrftoken cookie, same as the frontend's own client does on a first visit.
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)
    response = client.post(
        "/v0/browser/v1/auth/signup",
        data={"username": "newuser", "email": "newuser@example.test", "password": "correct-horse-battery-staple"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    # Mandatory email verification means signup succeeds but the session isn't authenticated yet -
    # allauth reports this as a 401 with a pending verify_email flow, not a 2xx.
    assert response.status_code == 401
    flows = {flow["id"]: flow for flow in response.json()["data"]["flows"]}
    assert flows["verify_email"]["is_pending"] is True


@pytest.mark.django_db
def test_a_password_change_names_the_session_that_made_it(client):
    """The end-to-end proof for HistoryContextMiddleware: a real authenticated write through
    allauth's own endpoint, not a synthetic one, names its actor - and never leaks what the
    password changed to."""
    host = f"auth.{settings.PARENT_HOST}"
    user = User.objects.create_user(username="alice", email="alice@example.test", password="old-password")
    client.force_login(user)
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)  # primes the csrftoken cookie

    response = client.post(
        "/v0/browser/v1/account/password/change",
        data={"current_password": "old-password", "new_password": "a-new-password"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    assert response.status_code == 200

    history = client.get(f"/v0/users/{user.id}/history/").json()["results"]
    update = next(event for event in history if event["action"] == "update")
    assert update["actor_id"] == str(user.id)
    assert "password" not in update
    assert update["changes"]["password"] == [None, None]


@pytest.mark.django_db
def test_the_session_carries_the_users_saved_language(client, settings):
    settings.LANGUAGES = [("en", "English"), ("tr", "Turkish")]
    # apps/users/headless.py's own reason for existing: the frontend resolves its language from
    # this same session payload it already fetches, with no extra request.
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x", language="tr")
    client.force_login(user)

    response = client.get("/v0/browser/v1/auth/session", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    assert response.json()["data"]["user"]["language"] == "tr"


@pytest.mark.django_db
def test_the_session_omits_language_when_the_user_has_no_preference(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    response = client.get("/v0/browser/v1/auth/session", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    # Matches how allauth's own DefaultHeadlessAdapter drops every other empty/None field
    # (email, username, ...) from this same payload rather than serving it as "".
    assert "language" not in response.json()["data"]["user"]


@pytest.mark.django_db
def test_the_served_specification_is_the_same_document_every_time(client):
    host = f"auth.{settings.PARENT_HOST}"

    first = client.get("/v0/openapi.json", HTTP_HOST=host)
    second = client.get("/v0/openapi.json", HTTP_HOST=host)

    assert first.status_code == 200
    assert first.content == second.content


@pytest.mark.django_db
def test_the_specification_still_describes_the_user_id_it_really_issues(client):
    """Pinned, but not to a lie: the id stays a string shaped like the uuid7s User.id holds."""
    response = client.get("/v0/openapi.json", HTTP_HOST=f"auth.{settings.PARENT_HOST}")

    identifier = response.json()["components"]["schemas"]["User"]["properties"]["id"]
    assert (identifier["type"], identifier["example"]) == ("string", EXAMPLE_USER_ID)
    assert uuid.UUID(identifier["example"]).version == 7
