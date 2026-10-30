"""Staff can decide one person's notification for them: the person sees it locked and why, is told, and gets their
own choice back when staff let go."""

import pytest
from django.urls import reverse
from isik.django.apps.notifications.audience.helpers import force_subscription, release_subscription
from isik.django.apps.notifications.kinds import raise_notice

from apps.features.declarations import STAFF
from apps.notifications.kinds import ACCOUNT_CHANGED, TOKEN_CREATED
from apps.notifications.models import InboxItem
from conftest import deliver_waiting_notices


KINDS = reverse("notification-kinds-list")
SUBSCRIPTIONS = reverse("notification-subscriptions-list")
REASON = "Turned off while we investigate repeated alerts on this account."


def _account_changed(user):
    raise_notice(ACCOUNT_CHANGED, variant="password_changed", snapshot={"user": str(user.pk)})
    deliver_waiting_notices()


def _kinds_in_inbox(user):
    return sorted(InboxItem.objects.filter(user=user).values_list("kind__name", flat=True))


@pytest.mark.django_db
def test_a_forced_kind_is_locked_says_why_and_the_person_is_told(client, signed_in):
    force_subscription(signed_in, ACCOUNT_CHANGED, enabled=False, source=STAFF, reason=REASON)
    deliver_waiting_notices()

    (entry,) = [entry for entry in client.get(KINDS).json() if entry["kind"] == "account_changed"]
    assert (entry["may_change"], entry["forced"], entry["forced_reason"]) == (False, True, REASON)
    assert _kinds_in_inbox(signed_in) == ["notification_settings_forced"]
    _account_changed(signed_in)
    assert _kinds_in_inbox(signed_in) == ["notification_settings_forced"]


@pytest.mark.django_db
def test_the_person_cannot_change_a_forced_kind(client, signed_in):
    force_subscription(signed_in, ACCOUNT_CHANGED, enabled=False, source=STAFF, reason=REASON)

    response = client.post(SUBSCRIPTIONS, {"kind": "account_changed", "enabled": True}, content_type="application/json")

    assert (response.status_code, response.json()["code"]) == (409, "subscription_forced")


@pytest.mark.django_db
def test_letting_go_gives_the_person_their_own_choice_back(client, signed_in):
    force_subscription(signed_in, ACCOUNT_CHANGED, enabled=False, source=STAFF, reason=REASON)

    assert release_subscription(signed_in, ACCOUNT_CHANGED) is True
    deliver_waiting_notices()
    InboxItem.objects.all().delete()
    _account_changed(signed_in)
    assert _kinds_in_inbox(signed_in) == ["account_changed"]


@pytest.mark.django_db
def test_a_mandatory_kind_cannot_be_forced_off(signed_in):
    with pytest.raises(ValueError, match="mandatory|MANDATORY"):
        force_subscription(signed_in, TOKEN_CREATED, enabled=False, source=STAFF, reason=REASON)
