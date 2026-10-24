#!/usr/bin/env bash
set -euo pipefail

# The workspace root, not apps/web, so packages/* are linted too.
cd {{ cookiecutter.project_slug }}-frontend
exec npm run lint
