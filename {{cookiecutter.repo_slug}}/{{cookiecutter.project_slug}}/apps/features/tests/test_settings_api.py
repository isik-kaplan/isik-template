"""A person's settings, as the web settings page reads them: each says what it is, why it is that value, and
whether they may change it - and one guarding their account asks them to prove it is them first."""

import pytest
from django.urls import reverse
from isik.django.apps.features.operations import force_setting
from isik.django.apps.features.resolution import effective

from apps.features.declarations import STAFF
from apps.users.reauthentication.gate import REAUTHENTICATION_REQUIRED_HEADER


SETTINGS = reverse("settings-list")
REASON = "Required for every account with access to production data."


def _detail(name):
    return reverse("settings-detail", args=[name])


def _settings(client):
    response = client.get(SETTINGS)
    return response["ETag"], {entry["name"]: entry for entry in response.json()}


def _patch(client, name, kind, value, etag):
    return client.patch(
        _detail(name), {"type": kind, "value": value}, content_type="application/json", HTTP_IF_MATCH=etag
    )


@pytest.mark.django_db
def test_each_setting_says_what_it_is_and_why(client, signed_in):
    _etag, settings = _settings(client)

    lifetime = settings["token_lifetime_days"]
    assert (lifetime["type"], lifetime["value"], lifetime["origin"], lifetime["may_change"]) == (
        "int",
        30,
        "default",
        True,
    )
{%- if cookiecutter.webhooks == "users" %}
    # Only staff set the limit, and without the feature it is its default.
    assert (settings["max_endpoints"]["origin"], settings["max_endpoints"]["may_change"]) == ("feature_missing", False)
{%- endif %}


@pytest.mark.django_db
def test_a_lifetime_beyond_ninety_days_is_kept_and_read_limited(client, signed_in):
    etag, _settings_now = _settings(client)

    response = _patch(client, "token_lifetime_days", "int", 120, etag)

    assert response.status_code == 200
    assert (response.json()["value"], response.json()["origin"]) == (90, "limited")


@pytest.mark.django_db
def test_a_change_names_the_version_it_read(client, signed_in):
    response = client.patch(
        _detail("token_lifetime_days"), {"type": "int", "value": 10}, content_type="application/json"
    )

    assert response.status_code == 428


@pytest.mark.django_db
def test_keeping_two_factor_asks_for_a_fresh_proof(client, signed_in, headless):
    etag, _settings_now = _settings(client)

    refused = _patch(client, "two_factor_required", "bool", True, etag)
    assert (refused.status_code, refused[REAUTHENTICATION_REQUIRED_HEADER]) == (403, "1")

    headless.prove()
    assert _patch(client, "two_factor_required", "bool", True, etag).status_code == 200
    assert effective(signed_in, "two_factor_required").value is True


@pytest.mark.django_db
def test_a_setting_staff_forced_is_locked_and_says_why(client, signed_in, headless):
    force_setting(signed_in, "two_factor_required", True, source=STAFF, reason=REASON)
    etag, settings = _settings(client)

    forced = settings["two_factor_required"]
    assert (forced["value"], forced["origin"], forced["forced_reason"], forced["may_change"]) == (
        True,
        "forced",
        REASON,
        False,
    )
    headless.prove()
    assert _patch(client, "two_factor_required", "bool", False, etag).status_code == 403
