"""Webhook endpoints: who may register them, what they're sent, and that our own network is out of reach."""

import pytest
from django.urls import reverse
{%- if cookiecutter.webhooks == "users" %}
from isik.django.apps.features.operations import force_setting, grant
{%- endif %}
from isik.django.apps.notifications import conf{% if cookiecutter.webhooks == "users" %}, pipeline{% endif %}

{% if cookiecutter.webhooks == "users" -%}
from apps.features.declarations import STAFF, WEBHOOKS
{% endif -%}
from apps.notifications.models import Delivery, Endpoint, EndpointKind, NoticeKindPolicy
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token
from conftest import deliver_waiting_notices


ENDPOINTS = reverse("notification-endpoints-list")


def _endpoint(url, **fields):
    endpoint = Endpoint.objects.create(url=url, secret="s3cret", **fields)
    EndpointKind.objects.create(endpoint=endpoint, kind=NoticeKindPolicy.objects.get(name="token_created"))
    return endpoint


def test_receivers_verify_a_header_named_for_the_project_not_its_display_name():
    assert conf.signature_header() == {{ ("X-" ~ cookiecutter.project_slug.replace("_", "-") ~ "-Signature")|tojson }}


@pytest.mark.django_db
def test_an_endpoint_on_our_own_network_is_refused_without_saying_where_it_led(alice):
    _endpoint({% if cookiecutter.webhooks == "users" %}"http://database:5432/", owner=alice{% else %}"http://database:5432/"{% endif %})
    make_token(user=alice, scopes=[], name="CI")

    deliver_waiting_notices()

    delivery = Delivery.objects.get(channel="webhook")
    assert delivery.state == "abandoned"
    assert "private" in delivery.attempts.get().error
    assert "database" not in delivery.attempts.get().error
{%- if cookiecutter.webhooks == "staff" %}


@pytest.fixture
def staff(client, signed_in, headless):
    User.objects.filter(pk=signed_in.pk).update(is_staff=True)
    headless.prove()
    return signed_in


@pytest.mark.django_db
def test_only_staff_see_or_register_the_deployments_endpoints(client, signed_in):
    _endpoint("https://hooks.example.test/")

    assert client.get(ENDPOINTS).status_code == 403
    assert (
        client.post(ENDPOINTS, {"url": "https://x.example.test/"}, content_type="application/json").status_code == 403
    )


@pytest.mark.django_db
def test_staff_see_every_endpoint_and_are_shown_a_new_ones_secret_once(client, staff):
    _endpoint("https://hooks.example.test/")

    made = client.post(
        ENDPOINTS,
        {"url": "https://new.example.test/", "kinds": [{"kind": "token_created"}]},
        content_type="application/json",
    )

    assert made.status_code == 201, made.content
    assert made.json()["secret"]
    assert len(client.get(ENDPOINTS).json()["results"]) == 2
    assert client.get(reverse("notification-endpoints-detail", args=[made.json()["id"]])).json()["secret"] is None
{%- endif %}
{%- if cookiecutter.webhooks == "users" %}


@pytest.mark.django_db
def test_an_endpoint_is_sent_its_owners_notices_and_nobody_elses(alice):
    bob = User.objects.create_user(username="bob", email="bob@example.test")
    hers = _endpoint("https://alice.example.test/", owner=alice)
    _endpoint("https://bob.example.test/", owner=bob)
    make_token(user=alice, scopes=[], name="CI")

    pipeline.fan_out()

    (delivery,) = Delivery.objects.filter(channel="webhook")
    assert delivery.webhook.endpoint_id == str(hers.pk)


@pytest.mark.django_db
def test_somebody_sees_and_registers_only_their_own_endpoints(client, signed_in, headless):
    _endpoint("https://bob.example.test/", owner=User.objects.create_user(username="bob", email="bob@example.test"))
    grant(signed_in, WEBHOOKS, source="staff")
    headless.prove()

    made = client.post(ENDPOINTS, {"url": "https://mine.example.test/"}, content_type="application/json")

    assert made.status_code == 201, made.content
    assert Endpoint.objects.get(pk=made.json()["id"]).owner == signed_in
    assert [endpoint["id"] for endpoint in client.get(ENDPOINTS).json()["results"]] == [made.json()["id"]]


@pytest.mark.django_db
def test_registering_an_endpoint_needs_somebody_to_have_just_proved_it_is_them(client, signed_in):
    assert (
        client.post(ENDPOINTS, {"url": "https://mine.example.test/"}, content_type="application/json").status_code
        == 403
    )


@pytest.mark.django_db
def test_registering_one_needs_the_webhooks_feature(client, signed_in, headless):
    headless.prove()

    response = client.post(ENDPOINTS, {"url": "https://mine.example.test/"}, content_type="application/json")

    assert (response.status_code, response.json()["code"]) == (403, "feature_missing")


@pytest.mark.django_db
def test_no_more_endpoints_than_the_limit_staff_set(client, signed_in, headless):
    grant(signed_in, WEBHOOKS, source="staff")
    force_setting(signed_in, "max_endpoints", 1, source=STAFF, reason="One endpoint while the integration is reviewed.")
    _endpoint("https://first.example.test/", owner=signed_in)
    headless.prove()

    response = client.post(ENDPOINTS, {"url": "https://second.example.test/"}, content_type="application/json")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "You have as many webhook endpoints as you may.",
        "code": "endpoint_limit_reached",
    }
{%- endif %}
