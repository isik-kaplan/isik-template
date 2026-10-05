"""That a write through the project's viewset base is actually covered, driven over HTTP.

The mechanism is isik's and tested there; what is ours is that `BaseModelViewSet` carries the mixin,
that a key is required, and that `ATOMIC_REQUESTS` gives the claim a transaction to commit inside - so
these go through the real request stack rather than calling the mixin.
"""

import json
import uuid

import pytest
from django.urls import reverse
from isik.django.apps.idempotency.by_reference.models import IdempotencyClaim
from isik.django.apps.idempotency.drf import IdempotencyMixin

from apps.users.models import User


KEY = IdempotencyMixin.idempotency_header
REPLAYED = IdempotencyMixin.idempotency_replayed_header


@pytest.fixture
def writer(client, settings):
    settings.ROOT_HOSTCONF = "apps.idempotency.tests.hosts"
    settings.ROOT_URLCONF = "apps.idempotency.tests.urls"
    client.force_login(User.objects.create_user(username="writer", email="writer@example.test", password="x"))
    return client


def _path():
    return reverse("writable-users-list")


def _create(client, key, username="bob"):
    body = {"username": username, "email": f"{username}@example.test"}
    return client.post(_path(), body, content_type="application/json", headers={KEY: str(key)})


@pytest.mark.django_db
def test_a_write_takes_a_claim(writer):
    key = uuid.uuid4()

    assert _create(writer, key).status_code == 201
    assert IdempotencyClaim.objects.filter(key=key).exists()


@pytest.mark.django_db
def test_the_same_key_and_body_answers_again_without_doing_the_work(writer):
    """The case this exists for: the first answer was lost, so the retry receives it rather than
    creating a second row."""
    key = uuid.uuid4()

    created = _create(writer, key)
    replayed = _create(writer, key)

    assert replayed.status_code == 201
    assert replayed.json() == created.json()
    assert replayed[REPLAYED] == "true"
    assert User.objects.filter(username="bob").count() == 1


@pytest.mark.django_db
def test_a_first_answer_does_not_claim_to_be_a_replay(writer):
    assert REPLAYED not in _create(writer, uuid.uuid4())


@pytest.mark.django_db
def test_the_same_key_for_a_different_body_is_refused(writer):
    """Answering it would hand one row back as though it were another."""
    key = uuid.uuid4()
    _create(writer, key, username="first")

    reused = _create(writer, key, username="second")

    assert reused.status_code == 422
    assert not User.objects.filter(username="second").exists()


@pytest.mark.django_db
def test_a_post_without_a_key_is_refused(writer):
    """`generic` rather than `post`, which the conftest fixture gives a key the way a real client does."""
    body = json.dumps({"username": "keyless", "email": "keyless@example.test"})

    refused = writer.generic("POST", _path(), body, content_type="application/json")

    assert refused.status_code == 400
    assert KEY in refused.json()
    assert not User.objects.filter(username="keyless").exists()


@pytest.mark.django_db
def test_a_key_that_is_not_a_uuid_is_refused(writer):
    refused = writer.post(
        _path(), {"username": "bob", "email": "bob@example.test"}, content_type="application/json", headers={KEY: "1"}
    )

    assert refused.status_code == 400
    assert not User.objects.filter(username="bob").exists()


@pytest.mark.django_db
def test_a_method_no_key_guards_needs_none(writer):
    """A GET is not a POST, and a listing that demanded a key would be the rule leaking."""
    assert writer.generic("GET", _path()).status_code == 200


@pytest.mark.django_db
def test_a_refused_request_leaves_its_key_unspent(writer):
    """A refusal rolls its claim back, so the same key is free once whatever refused it has changed."""
    key = uuid.uuid4()
    body = {"username": "not a username!", "email": "bob@example.test"}

    refused = writer.post(_path(), body, content_type="application/json", headers={KEY: str(key)})

    assert refused.status_code == 400
    assert not IdempotencyClaim.objects.filter(key=key).exists()
    assert _create(writer, key).status_code == 201
