import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage


def test_an_upload_round_trips_through_default_storage():
    name = default_storage.save(f"round-trip/{uuid.uuid4().hex}.txt", ContentFile(b"hello"))

    with default_storage.open(name) as stored:
        assert stored.read() == b"hello"
    default_storage.delete(name)
    assert not default_storage.exists(name)
