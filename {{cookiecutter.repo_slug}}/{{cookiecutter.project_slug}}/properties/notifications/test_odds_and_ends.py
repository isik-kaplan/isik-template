"""Who a notice goes to, how an inbox names who acted, and which push services the environment turns on."""

from types import SimpleNamespace

import pytest
from django.db import transaction
from hypothesis import given
from hypothesis import strategies as st

from apps.notifications.api.serializers.inbox_item import InboxItemSerializer
from apps.notifications.audiences import Reviewers
from apps.notifications.push import push_credentials
from apps.users.models.user import User


KEY = st.text(st.sampled_from("ab\\n"), max_size=6)


@given(team=KEY, key_id=KEY, key=KEY, topic=KEY, fcm=KEY)
def test_a_push_service_is_on_once_any_of_its_own_keys_is_set(team, key_id, key, topic, fcm):
    credentials = push_credentials(
        apns_team_id=team, apns_key_id=key_id, apns_key=key, apns_topic=topic, fcm_credentials=fcm
    )

    assert ("APNS" in credentials) is bool(team or key_id or key)
    assert ("FCM" in credentials) is bool(fcm)
    if "APNS" in credentials:
        assert credentials["APNS"]["KEY"] == key.replace("\\n", "\n")
        assert (credentials["APNS"]["TEAM_ID"], credentials["APNS"]["TOPIC"]) == (team, topic)


@pytest.mark.django_db
@given(people=st.lists(st.tuples(st.booleans(), st.booleans()), max_size=5))
def test_reviewers_are_exactly_the_active_superusers(people):
    with transaction.atomic():
        expected = set()
        for index, (superuser, active) in enumerate(people):
            person = User.objects.create_user(
                username=f"p{index}", email=f"p{index}@example.test", is_superuser=superuser, is_active=active
            )
            if superuser and active:
                expected.add(person.pk)

        assert set(Reviewers().recipients(notice=None).values_list("pk", flat=True)) == expected
        transaction.set_rollback(True)


@pytest.mark.parametrize("actor", ["nobody", "self", "someone"])
@given(viewer=st.integers(1, 10**6), other=st.integers(1, 10**6), staff=st.booleans())
def test_an_inbox_names_who_acted_only_as_self_staff_or_other(actor, viewer, other, staff):
    actor_id = {"nobody": None, "self": str(viewer), "someone": f"x{other}"}[actor]
    item = SimpleNamespace(actor_id=actor_id, actor_is_staff=staff)
    serializer = InboxItemSerializer(context={"request": SimpleNamespace(user=SimpleNamespace(pk=viewer))})

    named = serializer.get_actor(item)

    assert named == {"nobody": None, "self": "self", "someone": "staff" if staff else "other"}[actor]
