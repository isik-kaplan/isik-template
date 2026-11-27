"""STORAGE__BACKEND picks where uploads go, and a setting that can't work fails startup."""

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.common.storages import configured_storage


BUCKET = {
    "bucket_name": "uploads",
    "endpoint_url": "http://storage:3900",
    "access_key_id": "GK1",
    "secret_access_key": "secret",
    "region_name": "us-east-1",
    "addressing_style": "path",
}


def test_disk_keeps_uploads_on_the_media_volume():
    assert configured_storage("disk", **dict.fromkeys(BUCKET, "")) == {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": "/media"},
    }


def test_a_bucket_is_reached_with_everything_its_settings_give():
    assert configured_storage("s3", **BUCKET) == {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": "uploads",
            "endpoint_url": "http://storage:3900",
            "access_key": "GK1",
            "secret_key": "secret",
            "region_name": "us-east-1",
            "addressing_style": "path",
            "signature_version": "s3v4",
        },
    }


def test_a_bucket_with_no_endpoint_is_the_providers_own():
    assert configured_storage("s3", **{**BUCKET, "endpoint_url": ""})["OPTIONS"]["endpoint_url"] is None


def test_a_bucket_missing_what_reaching_it_takes_fails_startup_naming_each():
    missing = dict.fromkeys(("bucket_name", "access_key_id", "secret_access_key", "region_name"), "")
    with pytest.raises(ImproperlyConfigured) as error:
        configured_storage("s3", **{**BUCKET, **missing})
    assert str(error.value) == (
        "STORAGE__BACKEND is s3, so these need setting too: STORAGE__BUCKET_NAME, STORAGE__ACCESS_KEY_ID, "
        "STORAGE__SECRET_ACCESS_KEY, STORAGE__REGION_NAME"
    )


def test_a_backend_that_is_neither_fails_startup():
    with pytest.raises(ImproperlyConfigured) as error:
        configured_storage("gcs", **BUCKET)
    assert str(error.value) == "STORAGE__BACKEND is 'gcs'; it is one of disk, s3"
