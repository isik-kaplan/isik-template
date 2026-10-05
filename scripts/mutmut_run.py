#!/usr/bin/env python3
"""`mutmut`, with every mutant named after the mutation it makes - see mutation_naming.py.

The naming has to be in place before mutmut generates anything, which is before any pytest plugin
loads, so it cannot ride in through `[tool.mutmut]`. Run this in place of the `mutmut` command:

    uv run python scripts/mutmut_run.py run
    uv run python scripts/mutmut_run.py results
"""

import sys

from mutation_naming import apply


def main():
    apply()
    from mutmut.__main__ import cli

    sys.argv = ["mutmut", *sys.argv[1:]]
    return cli()


if __name__ == "__main__":
    main()
