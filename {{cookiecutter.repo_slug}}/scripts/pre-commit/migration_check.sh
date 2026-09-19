#!/usr/bin/env bash
set -euo pipefail

# manage.py only exists inside the backend image - this project has no host-side virtualenv.
#
# `exec` whenever the stack is already up: `run` would create a second backend container claiming
# the same network aliases and fail. `run --no-deps` covers the stack-down case and deliberately
# skips the database - this check compares models against migration files, so with no database
# reachable it only warns about the consistency check it had to skip, and still reports missing
# migrations correctly.
if [ -n "$(docker compose ps --status running --quiet backend 2>/dev/null)" ]; then
  exec docker compose exec -T backend python manage.py makemigrations --check --dry-run
fi

exec docker compose run --rm --no-deps -T backend python manage.py makemigrations --check --dry-run
