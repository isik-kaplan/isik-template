"""A trial ends with no write, so the sweep is what says it ended - and what the person's settings now are."""

from datetime import timedelta

import pytest
from django.utils import timezone
from isik.django.apps.features.operations import grant, set_setting, sweep_boundaries
from isik.django.apps.features.signals import setting_changed

from apps.features.declarations import LONG_LIVED_TOKENS


@pytest.mark.django_db
def test_a_trial_ending_brings_the_lifetime_back_under_ninety_days(alice):
    start = timezone.now()
    sweep_boundaries(now=start)
    set_setting(alice, "token_lifetime_days", 200)
    grant(alice, LONG_LIVED_TOKENS, source="trial", expires_at=start + timedelta(hours=1))
    moved = []

    def heard(sender, holder, name, before, after, **kwargs):
        moved.append((name, before.value, after.value))

    setting_changed.connect(heard)
    try:
        sweep_boundaries(now=start + timedelta(hours=2))
    finally:
        setting_changed.disconnect(heard)

    assert moved == [("token_lifetime_days", 200, 90)]
