#!/usr/bin/env python
"""Validates the answers before generation; the checks live in _validate.py, which tests can import."""

import sys
from pathlib import Path


# This runs from a tempfile with the new project as cwd, so neither __file__ nor cwd reaches hooks/.
sys.path.insert(0, str(Path({{ cookiecutter._template|tojson }}) / "hooks"))

from _validate import AnswersInvalid, validate_answers  # noqa: E402


# tojson, so a quote or backslash in an answer can't break this script's syntax.
try:
    validate_answers(
        project_name={{ cookiecutter.project_name|tojson }},
        project_slug={{ cookiecutter.project_slug|tojson }},
        repo_slug={{ cookiecutter.repo_slug|tojson }},
        description={{ cookiecutter.description|tojson }},
        author_name={{ cookiecutter.author_name|tojson }},
        author_email={{ cookiecutter.author_email|tojson }},
        domain={{ cookiecutter.domain|tojson }},
        languages={{ cookiecutter.languages|tojson }},
    )
except AnswersInvalid as error:
    print(f"ERROR: {error}", file=sys.stderr)
    sys.exit(1)
