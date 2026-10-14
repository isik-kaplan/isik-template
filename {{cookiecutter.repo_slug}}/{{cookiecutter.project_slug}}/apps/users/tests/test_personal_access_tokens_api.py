from datetime import timedelta

import pytest
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from django.utils import timezone

from apps.users.api.serializers.personal_access_token import TOKENS_PER_USER
from apps.users.models import PersonalAccessToken
from apps.users.models.user import User
from apps.users.personal_access_tokens import PREFIX, checksum, make_token


LIST = reverse("personal-access-tokens-list")
SCOPES = reverse("personal-access-tokens-scopes")
MANAGE = "users:manage:user"
GRANT = "users:grant:rights"


def _detail(token):
    return reverse("personal-access-tokens-detail", args=[token.pk])


def permission(name):
    return Permission.objects.get(content_type=ContentType.objects.get_for_model(Permission), codename=name)


def _make(client, **body):
    return client.post(LIST, {"name": "CI", **body}, content_type="application/json")


@pytest.fixture
def proven(signed_in, headless):
    headless.prove()
    return signed_in


@pytest.fixture
def manager(proven):
    proven.user_permissions.add(permission(MANAGE))
    return proven


@pytest.mark.django_db
def test_making_one_needs_somebody_to_have_just_proved_it_is_them(client, signed_in):
    assert _make(client).status_code == 403
    assert not PersonalAccessToken.objects.exists()


@pytest.mark.django_db
def test_the_token_is_answered_once_and_only_its_checksum_kept(client, manager):
    body = _make(client, scopes=[MANAGE]).json()

    token = PersonalAccessToken.objects.get()
    assert body["token"].startswith(PREFIX)
    assert token.token_checksum == checksum(body["token"])
    assert body["token"] not in token.token_checksum
    assert body["scopes"] == [MANAGE]
    assert body["expires_at"] is None
    assert client.get(_detail(token)).json()["token"] is None


@pytest.mark.django_db
def test_no_two_tokens_are_the_same(manager):
    first = make_token(user=manager, scopes=[], name="one").issued_token
    second = make_token(user=manager, scopes=[], name="two").issued_token

    assert first != second
    assert len(first) > len(PREFIX) + 40


@pytest.mark.django_db
def test_nobody_gives_a_token_what_they_do_not_hold(client, manager):
    response = _make(client, scopes=[MANAGE, GRANT])

    assert response.status_code == 400
    assert response.json()["scopes"] == [f"You cannot give a token what you do not hold: {GRANT}."]


@pytest.mark.django_db
def test_every_scope_not_held_is_named(client, proven):
    response = _make(client, scopes=[MANAGE, GRANT])

    assert response.json()["scopes"] == [f"You cannot give a token what you do not hold: {GRANT}, {MANAGE}."]


@pytest.mark.django_db
def test_an_expiry_of_this_very_moment_has_already_come(client, proven, monkeypatch):
    moment = timezone.now() + timedelta(days=1)
    monkeypatch.setattr("apps.users.api.serializers.personal_access_token.timezone.now", lambda: moment)

    response = _make(client, expires_at=moment.isoformat())

    assert response.json()["expires_at"] == ["Pick a moment still to come."]


@pytest.mark.django_db
def test_a_superuser_may_give_one_anything_delegatable(client, proven):
    proven.is_superuser = True
    proven.save()

    assert _make(client, scopes=[GRANT, MANAGE]).json()["scopes"] == [GRANT, MANAGE]


@pytest.mark.django_db
def test_an_expiry_must_be_still_to_come(client, proven):
    response = _make(client, expires_at=(timezone.now() - timedelta(minutes=1)).isoformat())

    assert response.status_code == 400
    assert response.json()["expires_at"] == ["Pick a moment still to come."]


@pytest.mark.django_db
def test_an_expiry_still_to_come_is_kept(client, proven):
    expires_at = timezone.now() + timedelta(days=30)

    body = _make(client, expires_at=expires_at.isoformat()).json()

    assert PersonalAccessToken.objects.get(pk=body["id"]).expires_at == expires_at


@pytest.mark.django_db
def test_a_token_needs_a_name(client, proven):
    assert _make(client, name="").status_code == 400


@pytest.mark.django_db
def test_there_is_a_ceiling_on_how_many_one_person_keeps(client, proven, headless):
    for number in range(TOKENS_PER_USER - 1):
        make_token(user=proven, scopes=[], name=f"token {number}")
    assert _make(client).status_code == 201
    # A proof buys one act.
    headless.prove()

    response = _make(client)

    assert response.status_code == 400
    assert response.json()["non_field_errors"] == [
        f"You can have at most {TOKENS_PER_USER} tokens. Delete one you no longer use."
    ]


@pytest.mark.django_db
def test_the_ceiling_is_counted_per_person(client, proven):
    bob = User.objects.create_user(username="bob")
    for number in range(TOKENS_PER_USER):
        make_token(user=bob, scopes=[], name=f"token {number}")

    assert _make(client).status_code == 201


@pytest.mark.django_db
def test_somebody_sees_only_their_own_tokens_newest_first(client, signed_in):
    older = make_token(user=signed_in, scopes=[], name="older")
    newer = make_token(user=signed_in, scopes=[], name="newer")
    make_token(user=User.objects.create_user(username="bob"), scopes=[], name="bob's")

    rows = client.get(LIST).json()["results"]

    assert [row["name"] for row in rows] == [newer.name, older.name]
    assert all(row["token"] is None for row in rows)


@pytest.mark.django_db
def test_somebody_elses_token_is_not_found(client, signed_in):
    theirs = make_token(user=User.objects.create_user(username="bob"), scopes=[], name="bob's")

    assert client.get(_detail(theirs)).status_code == 404
    assert client.delete(_detail(theirs)).status_code == 404


@pytest.mark.django_db
def test_deleting_one_needs_no_proof_and_ends_it(client, signed_in):
    token = make_token(user=signed_in, scopes=[], name="CI")

    assert client.delete(_detail(token)).status_code == 204
    assert not PersonalAccessToken.objects.exists()


@pytest.mark.django_db
def test_a_token_is_never_edited(client, proven):
    token = make_token(user=proven, scopes=[], name="CI")

    assert client.patch(_detail(token), {"name": "Other"}, content_type="application/json").status_code == 405


@pytest.mark.django_db
def test_nobody_signed_in_has_tokens(client):
    assert client.get(LIST).status_code == 403
    assert client.get(SCOPES).status_code == 403


@pytest.mark.django_db
def test_what_may_be_given_is_what_is_delegatable_and_held(client, signed_in):
    assert client.get(SCOPES).json() == []

    signed_in.user_permissions.add(permission(MANAGE))

    assert client.get(SCOPES).json() == [
        {"name": MANAGE, "label": "See everybody's account, and activate or deactivate them"}
    ]


@pytest.mark.django_db
def test_a_superuser_may_give_every_delegatable_scope(client, signed_in):
    signed_in.is_superuser = True
    signed_in.save()

    assert [scope["name"] for scope in client.get(SCOPES).json()] == [GRANT, MANAGE]
