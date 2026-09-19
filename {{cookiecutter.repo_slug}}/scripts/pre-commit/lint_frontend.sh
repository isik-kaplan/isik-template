#!/usr/bin/env bash
set -euo pipefail

# The workspace root, not apps/web: eslint, tsc and prettier all run across apps/* and packages/*
# from here, so the generated API clients are covered too. Autofixes as it goes, like the ruff
# hook beside it - pre-commit then fails on the modified files and asks for a re-stage.
cd {{ cookiecutter.project_slug }}-frontend
exec npm run lint
