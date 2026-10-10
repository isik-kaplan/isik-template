#!/bin/sh
# Creating a bucket needs s3:CreateBucket, a provisioning permission the web process has no business
# holding - so a deployment provisions its bucket, and here LocalStack does, on every start.
set -eu

if ! awslocal s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    # The one region S3 refuses a LocationConstraint for.
    if [ "$REGION_NAME" = "us-east-1" ]; then
        awslocal s3api create-bucket --bucket "$BUCKET_NAME"
    else
        awslocal s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION_NAME" \
            --create-bucket-configuration "LocationConstraint=$REGION_NAME"
    fi
fi
