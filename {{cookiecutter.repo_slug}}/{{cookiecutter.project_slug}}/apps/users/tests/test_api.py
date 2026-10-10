import pytest
from django.conf import settings
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.users.models.user import User


# django-hosts resolves by Host header; the test client's default Host ("testserver") matches no
# host() pattern, so it falls back to DEFAULT_HOST ("api") - these paths are relative to the api
# host's own urlconf (urls/api.py), which mounts apps.api.urls at "v0/" directly (no "api/" prefix
# - that's now the subdomain's job, not the path's).


@pytest.mark.django_db
def test_list_users_is_readable_anonymously(client):
    User.objects.create_user(username="alice", email="alice@example.test", password="x")
    response = client.get("/v0/users/")
    assert response.status_code == 200
    assert response.json()["count"] == 1


@pytest.mark.django_db
def test_creating_a_user_requires_write_permission(client):
    response = client.post("/v0/users/", {"username": "bob", "email": "bob@example.test", "password": "x"})
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_me_requires_authentication(client):
    response = client.get("/v0/users/me/")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_me_returns_the_logged_in_user(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)
    response = client.get("/v0/users/me/")
    assert response.status_code == 200
    assert response.json()["username"] == "alice"


@pytest.mark.django_db
def test_reading_me_writes_nothing(client):
    """A read routed down the write path still answers 200 with the same body, so only the absence
    of the write tells the two apart."""
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    with CaptureQueriesContext(connection) as queries:
        response = client.get("/v0/users/me/", {"language": "tr"})

    assert response.status_code == 200
    assert not [query for query in queries if query["sql"].lstrip().upper().startswith("UPDATE")]


@pytest.mark.django_db
def test_patching_me_requires_authentication(client):
    response = client.patch("/v0/users/me/", {"language": "tr"}, content_type="application/json")
    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_a_user_can_set_their_own_language_preference(client, a_second_language):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    response = client.patch("/v0/users/me/", {"language": "tr"}, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["language"] == "tr"
    user.refresh_from_db()
    assert user.language == "tr"


@pytest.mark.django_db
def test_patching_me_with_an_unsupported_language_is_rejected(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    response = client.patch("/v0/users/me/", {"language": "xx"}, content_type="application/json")

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.language == ""


@pytest.mark.django_db
def test_patching_me_cannot_change_username_or_email(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    response = client.patch(
        "/v0/users/me/",
        {"username": "mallory", "email": "mallory@example.test"},
        content_type="application/json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.username == "alice"
    assert user.email == "alice@example.test"


@pytest.mark.django_db
def test_a_users_history_records_its_creation(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    # Signing in stamps last_login, so the creation is the oldest event rather than the only one.
    response = client.get(f"/v0/users/{user.id}/history/?action=insert")

    assert response.status_code == 200
    (event,) = response.json()["results"]
    assert event["action"] == "insert"
    assert event["username"] == "alice"


@pytest.mark.django_db
def test_a_users_history_lists_a_hidden_change_without_its_values(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    user.first_name = "Alice"
    user.is_staff = True
    user.save()
    client.force_login(user)

    response = client.get(f"/v0/users/{user.id}/history/?action=update")

    (_sign_in, event) = response.json()["results"]  # newest first
    assert event["changes"]["first_name"] == ["", "Alice"]
    assert event["changes"]["is_staff"] == [None, None]
    assert "is_staff" not in event
    assert "last_login" not in event


@pytest.mark.django_db
def test_a_sign_in_is_listed_as_a_last_login_change(client):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(user)

    response = client.get(f"/v0/users/{user.id}/history/?action=update")

    (event,) = response.json()["results"]
    assert event["changes"]["last_login"] == [None, None]


@pytest.mark.django_db
def test_a_password_change_is_recorded_but_never_served(client):
    # UserSerializer doesn't expose "password" at all - changed straight on the model here rather
    # than through a real password-change request (test_auth.py's own job to cover end to end).
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    user.set_password("a-new-password")
    user.save()
    client.force_login(user)

    response = client.get(f"/v0/users/{user.id}/history/")
    # The sign-in that reads it is an update too (last_login), so the password's is the one before.
    update = next(event for event in response.json()["results"] if "password" in event["changes"])
    assert "password" not in update
    assert update["changes"]["password"] == [None, None]


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/v0/users/{id}/history/", "/v0/users/history/"])
def test_nobody_signed_out_reads_any_history(client, path):
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")

    response = client.get(path.format(id=user.id))

    assert response.status_code == 403


@pytest.mark.django_db
def test_somebody_elses_history_is_refused(client):
    alice = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    mallory = User.objects.create_user(username="mallory", email="mallory@example.test", password="x")
    client.force_login(mallory)

    response = client.get(f"/v0/users/{alice.id}/history/")

    assert response.status_code == 403


@pytest.mark.django_db
def test_staff_read_anybodys_history(client):
    alice = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    staff = User.objects.create_user(username="staff", email="staff@example.test", password="x", is_staff=True)
    client.force_login(staff)

    response = client.get(f"/v0/users/{alice.id}/history/")

    assert response.status_code == 200
    assert [event["username"] for event in response.json()["results"]] == ["alice"]


@pytest.mark.django_db
def test_the_cross_user_history_shows_somebody_signed_in_only_their_own(client):
    alice = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    User.objects.create_user(username="mallory", email="mallory@example.test", password="x")
    client.force_login(alice)

    response = client.get("/v0/users/history/")

    assert response.status_code == 200
    assert {event["id"] for event in response.json()["results"]} == {str(alice.id)}


@pytest.mark.django_db
def test_staff_read_the_cross_user_history(client):
    superuser = User.objects.create_user(username="root", email="root@example.test", password="x", is_staff=True)
    User.objects.create_user(username="alice", email="alice@example.test", password="x")
    client.force_login(superuser)

    response = client.get("/v0/users/history/")

    assert response.status_code == 200
    # root's own creation plus alice's - across every user, not just one.
    assert response.json()["count"] >= 2


@pytest.mark.django_db
def test_the_cross_user_history_filters_by_actor(client):
    # HistoryMixin's own default "actor" filter assumes an integer pk - User.id is a uuid7, so
    # this also proves UserViewSet's own filter_cls override is what's actually wired in, not just
    # that the endpoint exists (a plain int filter would 400 on a UUID query value instead).
    host = f"auth.{settings.PARENT_HOST}"
    superuser = User.objects.create_superuser(username="root", email="root@example.test", password="x")
    alice = User.objects.create_user(username="alice", email="alice@example.test", password="old-password")
    client.force_login(alice)
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)  # primes the csrftoken cookie
    client.post(
        "/v0/browser/v1/account/password/change",
        data={"current_password": "old-password", "new_password": "a-new-password"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    client.force_login(superuser)

    response = client.get(f"/v0/users/history/?actor={alice.id}")

    assert response.status_code == 200
    results = response.json()["results"]
    assert results and all(event["actor_id"] == str(alice.id) for event in results)
    assert any(event["action"] == "update" for event in results)
