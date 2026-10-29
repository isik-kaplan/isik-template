"""Somebody's inbox is theirs alone, says who acted without naming them, and is marked read by its owner."""

import pghistory
import pytest
from django.urls import reverse
from isik.django.apps.notifications.kinds import raise_notice

from apps.notifications.kinds import ACCOUNT_CHANGED
from apps.notifications.models import InboxItem
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token
from conftest import deliver_waiting_notices


INBOX = reverse("notification-inbox-list")
READ_ALL = reverse("notification-inbox-read-all")
SUBSCRIPTIONS = reverse("notification-subscriptions-list")
KINDS = reverse("notification-kinds-list")


def _token_for(user, actor=None):
    """A token made the way a request made by `actor` would, so the notice carries who acted."""
    with pghistory.context(**({"user": str(actor.pk)} if actor else {})):
        make_token(user=user, scopes=[], name="CI")
    deliver_waiting_notices()


@pytest.mark.django_db
def test_the_inbox_holds_only_its_owners_notifications(client, signed_in):
    _token_for(signed_in)
    _token_for(User.objects.create_user(username="bob", email="bob@example.test"))

    items = client.get(INBOX).json()["results"]

    assert [item["kind"] for item in items] == ["token_created"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("who", "expected"), [("owner", "self"), ("staff", "staff"), ("someone", "other"), (None, None)]
)
def test_it_says_who_acted_without_saying_who_they_are(client, signed_in, who, expected):
    actors = {
        "owner": signed_in,
        "staff": User.objects.create_user(username="admin", email="admin@example.test", is_staff=True),
        "someone": User.objects.create_user(username="carol", email="carol@example.test"),
        None: None,
    }
    _token_for(signed_in, actors[who])

    (item,) = client.get(INBOX).json()["results"]

    assert item["actor"] == expected
    assert "actor_id" not in item


@pytest.mark.django_db
def test_reading_one_or_all_marks_them_and_unread_lists_what_is_left(client, signed_in):
    _token_for(signed_in)
    _token_for(signed_in)
    first, second = InboxItem.objects.filter(user=signed_in)

    assert client.post(reverse("notification-inbox-read", args=[first.pk])).status_code == 200
    assert [item["id"] for item in client.get(INBOX, {"unread": "true"}).json()["results"]] == [str(second.pk)]
    assert client.post(READ_ALL).json() == {"marked": 1}
    assert client.get(INBOX, {"unread": "true"}).json()["results"] == []


@pytest.mark.django_db
def test_somebody_else_cannot_mark_an_item_read(client, signed_in):
    bob = User.objects.create_user(username="bob", email="bob@example.test")
    _token_for(bob)
    (item,) = InboxItem.objects.filter(user=bob)

    assert client.post(reverse("notification-inbox-read", args=[item.pk])).status_code == 404
    item.refresh_from_db()
    assert item.read_at is None


@pytest.mark.django_db
def test_an_item_reads_as_a_sentence_from_its_own_data(client, signed_in):
    _token_for(signed_in)
    raise_notice(ACCOUNT_CHANGED, variant="password_changed", snapshot={"user": str(signed_in.pk)})
    deliver_waiting_notices()

    messages = {item["kind"]: item["message"] for item in client.get(INBOX).json()["results"]}

    assert messages == {
        "token_created": 'A personal access token named "CI" was created.',
        "account_changed": "Your password was changed.",
    }


@pytest.mark.django_db
def test_every_kind_but_allauths_own_mail_is_listed_and_only_some_may_be_turned_off(client, signed_in):
    kinds = {entry["kind"]: entry["may_change"] for entry in client.get(KINDS).json()}

    assert {kind for kind, may_change in kinds.items() if may_change} == {"account_changed", "application_reviewed"}
    assert not any(kind.startswith("mail_") for kind in kinds)
    assert "notification_settings_forced" in kinds


@pytest.mark.django_db
def test_turning_a_kind_off_keeps_it_out_of_the_inbox(client, signed_in):
    response = client.post(
        SUBSCRIPTIONS, {"kind": "account_changed", "enabled": False}, content_type="application/json"
    )

    assert response.status_code == 201
    raise_notice(ACCOUNT_CHANGED, variant="password_changed", snapshot={"user": str(signed_in.pk)})
    deliver_waiting_notices()
    assert not InboxItem.objects.filter(user=signed_in).exists()


@pytest.mark.django_db
def test_a_mandatory_kind_cannot_be_turned_off(client, signed_in):
    response = client.post(SUBSCRIPTIONS, {"kind": "token_created", "enabled": False}, content_type="application/json")

    assert (response.status_code, response.json()["code"]) == (409, "kind_mandatory")
