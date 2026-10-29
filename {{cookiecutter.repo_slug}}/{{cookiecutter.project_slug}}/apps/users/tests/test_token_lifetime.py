"""How long a new token works is the person's token lifetime: 90 days at most without long-lived tokens, and what
staff force it to when they do."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from isik.django.apps.features.operations import force_setting, grant, set_setting

from apps.features.declarations import LONG_LIVED_TOKENS, STAFF
from apps.users.models import PersonalAccessToken


LIST = reverse("personal-access-tokens-list")
REASON = "Shortened while this account's tokens are being reviewed."


def _make(client, headless, days=None):
    # A proof is spent on each token made.
    headless.prove()
    body = {"name": "CI"}
    if days is not None:
        body["expires_at"] = (timezone.now() + timedelta(days=days)).isoformat()
    return client.post(LIST, body, content_type="application/json")


def _lifetime_of(response):
    expires_at = PersonalAccessToken.objects.get(pk=response.json()["id"]).expires_at
    return round((expires_at - timezone.now()) / timedelta(days=1))


@pytest.mark.django_db
def test_a_token_given_no_expiry_lasts_the_lifetime(client, signed_in, headless):
    assert _lifetime_of(_make(client, headless)) == 30


@pytest.mark.django_db
def test_without_long_lived_tokens_ninety_days_is_the_most(client, signed_in, headless):
    set_setting(signed_in, "token_lifetime_days", 200)

    assert _lifetime_of(_make(client, headless)) == 90
    response = _make(client, headless, days=91)
    assert response.status_code == 400
    assert response.json()["expires_at"] == ["A token of yours can work for at most 90 days."]


@pytest.mark.django_db
def test_a_trial_of_long_lived_tokens_lets_the_own_lifetime_through(client, signed_in, headless):
    set_setting(signed_in, "token_lifetime_days", 200)
    grant(signed_in, LONG_LIVED_TOKENS, source="trial", expires_at=timezone.now() + timedelta(days=14))

    assert _make(client, headless, days=200).status_code == 201


@pytest.mark.django_db
def test_a_lifetime_staff_forced_wins_over_the_own(client, signed_in, headless):
    set_setting(signed_in, "token_lifetime_days", 60)
    force_setting(signed_in, "token_lifetime_days", 7, source=STAFF, reason=REASON)

    assert _make(client, headless, days=8).status_code == 400
    assert _lifetime_of(_make(client, headless)) == 7
