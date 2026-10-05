#!/usr/bin/env bash
set -euo pipefail

# Two questions, not one: does each document generate without a single warning, and is each committed
# client still what its document says. The second is what regenerating before committing was always
# a rule about, and a rule is not a gate. `--write` regenerates packages/api's client instead of
# comparing it.

FRONTEND={{ cookiecutter.project_slug }}-frontend
GENERATE=$FRONTEND/node_modules/.bin/openapi-typescript
GENERATED=$FRONTEND/packages/api/src/schema.ts

backend() {
  # Same exec-or-run split as migration_check.sh, for the same reason. Building a document reads no
  # table, so the stack-down case needs no database either.
  if [ -n "$(docker compose ps --status running --quiet backend 2>/dev/null)" ]; then
    docker compose exec -T backend "$@"
  else
    docker compose run --rm --no-deps -T backend "$@"
  fi
}

if [ ! -x "$GENERATE" ]; then
  echo "openapi-check: $GENERATE is missing - run npm ci in $FRONTEND first." >&2
  exit 1
fi

# Cleared however this exits, including through a failed diff below.
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

backend python manage.py openapi_document api > "$SCRATCH/api.json"
backend python manage.py openapi_document auth > "$SCRATCH/auth.json"
"$GENERATE" "$SCRATCH/api.json" --output "$SCRATCH/api.ts" > /dev/null

if [ "${1:-}" = "--write" ]; then
  cp "$SCRATCH/api.ts" "$GENERATED"
  echo "openapi-check: regenerated $GENERATED."
fi

failed=0
if ! diff -q "$GENERATED" "$SCRATCH/api.ts" > /dev/null; then
  echo "openapi-check: $GENERATED is not what this API produces." >&2
  # `|| true`: a diff that found something exits non-zero, and pipefail would end the run here,
  # before the auth client is checked at all.
  { diff "$GENERATED" "$SCRATCH/api.ts" || true; } | head -20 >&2
  echo "               Regenerate it with scripts/pre-commit/openapi_check.sh --write and commit the result." >&2
  failed=1
fi

# packages/auth-api is written by hand, so it has no output to compare - every operation it declares
# is checked against what allauth serves instead.
node "$FRONTEND/packages/auth-api/check-schema-paths.mjs" "$SCRATCH/auth.json" || failed=1

exit "$failed"
