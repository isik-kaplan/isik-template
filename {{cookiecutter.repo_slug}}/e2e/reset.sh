#!/usr/bin/env bash
# Clears what a suite wrote - the app's database, mail and the run-once marker - and nothing else, so the next run
# starts clean without Authentik's minutes-long cold start. `docker compose down -v` is the full reset.
set -euo pipefail
cd "$(dirname "$0")"

project="$(docker compose config --format json | python3 -c 'import json, sys; print(json.load(sys.stdin)["name"])')"
# Of the services that hold or write the app's data, whichever this stack has.
services=$(docker compose config --services | grep -xE 'database|backend|worker|scheduler|mailpit' || true)

# Removed, not stopped: a volume still attached to a container refuses to go.
docker compose rm --stop --force $services
# --force: the marker's volume exists only once a whole suite has run.
docker volume rm --force "${project}_postgres_data" "${project}_e2e-state"
docker compose up -d --wait
