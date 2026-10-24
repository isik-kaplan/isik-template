#!/bin/sh
# Starts Garage and ensures the layout, the app's key and its bucket on every start, so the web
# process never needs the right to create a bucket.
set -eu

rm -f /tmp/ready

cat > "$GARAGE_CONFIG_FILE" <<CONFIG
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
# One node, so one copy - durability is whatever the volume under it gives.
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$RPC_SECRET"

[s3_api]
# Signed into every request, so it has to be the region the app is configured with.
s3_region = "$REGION_NAME"
api_bind_addr = "[::]:3900"
CONFIG

garage server &
server=$!
trap 'kill -TERM "$server"; wait "$server"; exit 0' TERM INT

until garage status >/dev/null 2>&1; do sleep 1; done

if garage status | grep -q "NO ROLE ASSIGNED"; then
    # Capacity only weighs nodes against each other; with one node it limits nothing.
    garage layout assign -z local -c 1T "$(garage node id -q | cut -c1-16)"
    garage layout apply --version 1
fi

# Imported, not generated, so the key is the one .env names; redone when the secret changes.
if ! garage key info --show-secret "$ACCESS_KEY_ID" 2>/dev/null | grep -q "$SECRET_ACCESS_KEY"; then
    garage key delete --yes "$ACCESS_KEY_ID" >/dev/null 2>&1 || true
    garage key import --yes -n app "$ACCESS_KEY_ID" "$SECRET_ACCESS_KEY"
fi

# Only the test suite needs it, for a bucket per worker.
if [ "$KEY_CAN_CREATE_BUCKETS" = "true" ]; then
    garage key allow --create-bucket "$ACCESS_KEY_ID"
else
    garage key deny --create-bucket "$ACCESS_KEY_ID"
fi

garage bucket info "$BUCKET_NAME" >/dev/null 2>&1 || garage bucket create "$BUCKET_NAME"
garage bucket allow --read --write "$BUCKET_NAME" --key "$ACCESS_KEY_ID"

touch /tmp/ready
wait "$server"
