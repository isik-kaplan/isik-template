import pytest

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
