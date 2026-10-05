import threading
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage, storages
from django.test import override_settings

from apps.common.storage import ensure_bucket


def _default_storage_with(**options):
    """STORAGES with the default backend's options changed - against real LocalStack, never a mock."""
    default = {**settings.STORAGES["default"]}
    default["OPTIONS"] = {**default["OPTIONS"], **options}
    return override_settings(STORAGES={**settings.STORAGES, "default": default})


def _fresh_bucket():
    return f"test-ensure-{uuid.uuid4().hex[:12]}"


def test_a_missing_bucket_is_created_and_an_existing_one_left_alone():
    bucket = _fresh_bucket()
    with _default_storage_with(bucket_name=bucket):
        client = storages["default"].connection.meta.client

        assert ensure_bucket() is True
        client.head_bucket(Bucket=bucket)
        assert ensure_bucket() is False


@pytest.mark.parametrize(("region", "location"), [("eu-west-1", "eu-west-1"), ("us-east-1", None)])
def test_the_bucket_is_created_in_the_configured_region(region, location):
    bucket = _fresh_bucket()
    with _default_storage_with(bucket_name=bucket, region_name=region):
        ensure_bucket()

        client = storages["default"].connection.meta.client
        assert client.get_bucket_location(Bucket=bucket)["LocationConstraint"] == location


def test_an_upload_round_trips_through_default_storage():
    name = default_storage.save(f"round-trip/{uuid.uuid4().hex}.txt", ContentFile(b"hello"))

    with default_storage.open(name) as stored:
        assert stored.read() == b"hello"
    default_storage.delete(name)
    assert not default_storage.exists(name)


class _Forbidden(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.send_response(403)
        self.end_headers()

    def log_message(self, *args):
        pass


def test_a_refusal_other_than_not_found_is_raised_rather_than_answered_with_a_new_bucket():
    server = HTTPServer(("127.0.0.1", 0), _Forbidden)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        endpoint = f"http://127.0.0.1:{server.server_address[1]}"
        with _default_storage_with(endpoint_url=endpoint), pytest.raises(ClientError) as raised:
            ensure_bucket()
    finally:
        server.shutdown()
        server.server_close()

    assert raised.value.response["ResponseMetadata"]["HTTPStatusCode"] == 403
