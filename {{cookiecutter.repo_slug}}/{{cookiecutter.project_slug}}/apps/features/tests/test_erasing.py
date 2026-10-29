"""Deleting somebody takes their feature grants and settings with them, in the same transaction."""

import pytest
from isik.django.apps.features.operations import grant, set_setting

from apps.features.declarations import LONG_LIVED_TOKENS
from apps.features.models import FeatureGrant, UserOverrides
from apps.users.models.user import User


@pytest.mark.django_db
def test_deleting_a_person_erases_what_they_were_granted_and_set():
    user = User.objects.create_user(username="bob", email="bob@example.test")
    kept = User.objects.create_user(username="carol", email="carol@example.test")
    for holder in (user, kept):
        grant(holder, LONG_LIVED_TOKENS, source="staff")
        set_setting(holder, "token_lifetime_days", 60)

    user.delete()

    assert not User.objects.filter(pk=user.pk).exists()
    assert list(FeatureGrant.objects.values_list("holder", flat=True)) == [kept.pk]
    assert list(UserOverrides.objects.values_list("holder", flat=True)) == [kept.pk]
