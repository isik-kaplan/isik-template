#!/usr/bin/env bash
set -euo pipefail

# `exec` when the stack is up: a second backend container from `run` would claim the same aliases and fail.
# No database is needed: without one makemigrations only skips its consistency check.
if [ -n "$(docker compose ps --status running --quiet backend 2>/dev/null)" ]; then
  exec docker compose exec -T backend python manage.py makemigrations --check --dry-run
fi

exec docker compose run --rm --no-deps -T backend python manage.py makemigrations --check --dry-run
