#!/usr/bin/env python
"""Validates cookiecutter.json answers before any file is generated.

Required fields have no default (see cookiecutter.json) precisely so a blank answer must be
caught here rather than silently producing a "myproject"/"localhost"-shaped project.

The actual checks live in _validate.py, a plain (non-templated) module - this script is itself a
Jinja template (cookiecutter renders it, then runs it as a subprocess), which neither pytest nor
mutmut's coverage tracking can see into.
"""

import sys
from pathlib import Path


# cookiecutter renders this whole script into a throwaway tempfile and runs it with the new
# project's own directory as cwd - neither __file__ nor cwd points back at this repo's hooks/, so
# _validate.py has to be found via cookiecutter's own template-path context variable instead.
sys.path.insert(0, str(Path({{ cookiecutter._template|tojson }}) / "hooks"))

from _validate import AnswersInvalid, validate_answers  # noqa: E402


# Every answer goes in through tojson, so a quote or backslash in one reaches the validator as data
# instead of breaking this script's own syntax.
try:
    validate_answers(
        project_name={{ cookiecutter.project_name|tojson }},
        project_slug={{ cookiecutter.project_slug|tojson }},
        repo_slug={{ cookiecutter.repo_slug|tojson }},
        description={{ cookiecutter.description|tojson }},
        author_name={{ cookiecutter.author_name|tojson }},
        author_email={{ cookiecutter.author_email|tojson }},
        domain={{ cookiecutter.domain|tojson }},
        social_login_providers={{ cookiecutter.social_login_providers|tojson }},
        social_login_provider_icons={{ cookiecutter.social_login_provider_icons|tojson }},
        languages={{ cookiecutter.languages|tojson }},
    )
except AnswersInvalid as error:
    print(f"ERROR: {error}", file=sys.stderr)
    sys.exit(1)
