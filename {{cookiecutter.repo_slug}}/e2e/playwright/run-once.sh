#!/bin/sh
# A whole suite runs once per stack: specs never clear what they write, so a second one reads a database
# the first has grown. Handed a command (one spec, a reporter), it runs that and is never refused.
set -e

MARKER=/e2e-state/the-suite-has-run

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ -e "$MARKER" ]; then
  echo "This stack has already had the whole suite run against it." >&2
  echo "Clear what it wrote, keeping Authentik warm:  bash reset.sh" >&2
  echo "Or run one spec:  docker compose run --rm playwright npx playwright test <spec>" >&2
  exit 1
fi

touch "$MARKER"
exec npx playwright test
