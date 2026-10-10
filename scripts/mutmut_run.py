#!/usr/bin/env python3
"""`mutmut`, with every mutant named after the mutation it makes - see the generated project's
scripts/mutation_naming.py, the one copy this imports.

The naming has to be in place before mutmut generates anything, which is before any pytest plugin
loads, so it cannot ride in through `[tool.mutmut]`. Run this in place of the `mutmut` command:

    uv run python scripts/mutmut_run.py run
    uv run python scripts/mutmut_run.py results
"""

import sys
from pathlib import Path


# The template's copy is plain Python with no Jinja in it, so it runs from inside the template tree as-is.
ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_SCRIPTS = ROOT / "{{cookiecutter.repo_slug}}" / "{{cookiecutter.project_slug}}" / "scripts"


def main():
    # No __pycache__ left inside the template tree, where the next bake would copy it into the project.
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(TEMPLATE_SCRIPTS))
    from mutation_naming import apply

    apply()
    from mutmut.__main__ import cli

    sys.argv = ["mutmut", *sys.argv[1:]]
    return cli()


if __name__ == "__main__":
    main()
