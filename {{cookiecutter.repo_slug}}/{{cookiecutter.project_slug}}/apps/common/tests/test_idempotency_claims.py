"""Over the real request stack: ours is that `BaseModelViewSet` carries the mixin and `ATOMIC_REQUESTS`
gives the claim a transaction."""

import json
import uuid

import pytest
from django.urls import reverse
from isik.django.apps.idempotency.drf import IdempotencyMixin

from apps.common.models import IdempotencyClaim
from apps.users.models import User
from apps.users.tests.conftest import signup_names


KEY = IdempotencyMixin.idempotency_header
REPLAYED = IdempotencyMixin.idempotency_replayed_header


@pytest.fixture
def writer(client, settings):
    settings.ROOT_HOSTCONF = "apps.common.tests.idempotency_hosts"
    settings.ROOT_URLCONF = "apps.common.tests.idempotency_urls"
    client.force_login(User.objects.create_user(username="writer", email="writer@example.test", password="x"))
    return client


def _path():
    return reverse("writable-users-list")


def _create(client, key, handle="bob"):
    body = {**signup_names(handle), "email": f"{handle}@example.test"}
    return client.post(_path(), body, content_type="application/json", headers={KEY: str(key)})


@pytest.mark.django_db
def test_a_write_takes_a_claim(writer):
    key = uuid.uuid4()

    assert _create(writer, key).status_code == 201
    assert IdempotencyClaim.objects.filter(key=key).exists()


@pytest.mark.django_db
def test_the_same_key_and_body_answers_again_without_doing_the_work(writer):
    key = uuid.uuid4()

    created = _create(writer, key)
    replayed = _create(writer, key)

    assert replayed.status_code == 201
    assert replayed.json() == created.json()
    assert replayed[REPLAYED] == "true"
    assert User.objects.filter(email="bob@example.test").count() == 1


@pytest.mark.django_db
def test_a_first_answer_does_not_claim_to_be_a_replay(writer):
    assert REPLAYED not in _create(writer, uuid.uuid4())


@pytest.mark.django_db
def test_the_same_key_for_a_different_body_is_refused(writer):
    key = uuid.uuid4()
    _create(writer, key, handle="first")

    reused = _create(writer, key, handle="second")

    assert reused.status_code == 422
    assert not User.objects.filter(email="second@example.test").exists()


@pytest.mark.django_db
def test_a_post_without_a_key_is_refused(writer):
    """`generic`, since conftest gives every `post` a key."""
    body = json.dumps({**signup_names("keyless"), "email": "keyless@example.test"})

    refused = writer.generic("POST", _path(), body, content_type="application/json")

    assert refused.status_code == 400
    assert KEY in refused.json()
    assert not User.objects.filter(email="keyless@example.test").exists()


@pytest.mark.django_db
def test_a_key_that_is_not_a_uuid_is_refused(writer):
    body = {**signup_names("bob"), "email": "bob@example.test"}

    refused = writer.post(_path(), body, content_type="application/json", headers={KEY: "1"})

    assert refused.status_code == 400
    assert not User.objects.filter(email="bob@example.test").exists()


@pytest.mark.django_db
def test_a_method_no_key_guards_needs_none(writer):
    assert writer.generic("GET", _path()).status_code == 200


@pytest.mark.django_db
def test_a_refused_request_leaves_its_key_unspent(writer):
    key = uuid.uuid4()
    # Refused whatever names the project asks for.
    body = {**signup_names("bob"), "email": "not an address"}

    refused = writer.post(_path(), body, content_type="application/json", headers={KEY: str(key)})

    assert refused.status_code == 400
    assert not IdempotencyClaim.objects.filter(key=key).exists()
    assert _create(writer, key).status_code == 201
