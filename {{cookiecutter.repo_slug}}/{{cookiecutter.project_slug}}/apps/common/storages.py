"""Where uploads go, as STORAGE__BACKEND names it: the media volume, or a bucket."""

from django.core.exceptions import ImproperlyConfigured


BACKENDS = ("disk", "s3")

# The `media` volume, where docker-compose.yml mounts it in the backend and, read-only, in nginx.
MEDIA_ROOT = "/media"

S3_STORAGE = "storages.backends.s3.S3Storage"


def configured_storage(
    backend, *, bucket_name, endpoint_url, access_key_id, secret_access_key, region_name, addressing_style
):
    """Fails startup on a backend that isn't one, or a bucket missing what reaching it takes."""
    if backend == "disk":
        return {"BACKEND": "django.core.files.storage.FileSystemStorage", "OPTIONS": {"location": MEDIA_ROOT}}
    if backend == "s3":
        given = {
            "BUCKET_NAME": bucket_name,
            "ACCESS_KEY_ID": access_key_id,
            "SECRET_ACCESS_KEY": secret_access_key,
            "REGION_NAME": region_name,
        }
        missing = [f"STORAGE__{name}" for name, value in given.items() if not value]
        if missing:
            raise ImproperlyConfigured(f"STORAGE__BACKEND is s3, so these need setting too: {', '.join(missing)}")
        return {
            "BACKEND": S3_STORAGE,
            "OPTIONS": {
                "bucket_name": bucket_name,
                # Unset, the provider's own: AWS's, by region.
                "endpoint_url": endpoint_url or None,
                "access_key": access_key_id,
                "secret_key": secret_access_key,
                "region_name": region_name,
                # Garage takes only "path"; AWS is moving new buckets to "virtual".
                "addressing_style": addressing_style,
                # boto3 still presigns with SigV2 in us-east-1, which Garage refuses.
                "signature_version": "s3v4",
            },
        }
    raise ImproperlyConfigured(f"STORAGE__BACKEND is {backend!r}; it is one of {', '.join(BACKENDS)}")
