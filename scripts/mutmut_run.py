#!/usr/bin/env python3
"""`mutmut` with every mutant named after its mutation; use it in place of the `mutmut` command.

The naming must be in place before any pytest plugin loads, so `[tool.mutmut]` can't carry it.
"""

import sys
from pathlib import Path


# The template's copy has no Jinja, so it runs from inside the template tree.
ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_SCRIPTS = ROOT / "{{cookiecutter.repo_slug}}" / "{{cookiecutter.project_slug}}" / "scripts"


def main():
    # A __pycache__ in the template tree would be copied into the next bake.
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(TEMPLATE_SCRIPTS))
    from mutation_naming import apply

    apply()
    from mutmut.__main__ import cli

    sys.argv = ["mutmut", *sys.argv[1:]]
    return cli()


if __name__ == "__main__":
    main()
