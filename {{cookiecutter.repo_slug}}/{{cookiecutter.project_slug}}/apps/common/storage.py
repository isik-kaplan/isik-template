from botocore.exceptions import ClientError
from django.core.files.storage import storages


# The one region S3 refuses a LocationConstraint for - a bucket there is created without one.
_DEFAULT_REGION = "us-east-1"


def ensure_bucket():
    """Create the default storage's bucket if it is missing, and say whether it had to.

    Read off `storages["default"]` rather than the config, so the bucket checked is always the one
    uploads actually go to - including a test run's own.
    """
    storage = storages["default"]
    client = storage.connection.meta.client
    try:
        client.head_bucket(Bucket=storage.bucket_name)
    except ClientError as error:
        # The status, not the error code: head_bucket has no body, so S3-compatible services disagree
        # on the code they report for a missing bucket, never on the 404.
        if error.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
            raise
        region = storage.region_name
        options = {} if region == _DEFAULT_REGION else {"CreateBucketConfiguration": {"LocationConstraint": region}}
        client.create_bucket(Bucket=storage.bucket_name, **options)
        return True
    return False
