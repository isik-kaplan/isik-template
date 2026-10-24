"""List functions phase one can't kill: run-once code (import, model build, `lru_cache`) already ran
in mutmut's parent process, so it shows up traced only to whichever test first triggered it.

    python scripts/mutation_tracing.py [path/to/stats.json]
"""

import json
import sys
from collections import defaultdict
from pathlib import Path


CANDIDATES = ("mutants/mutmut-stats.json", "mutmut-stats.json")

THIN = 2  # at most this many tracing tests
SPREAD = 2  # unrelated modules a sole tracer must span to be a first caller


def traced(stats_path=None):
    paths = [Path(stats_path)] if stats_path else [Path(name) for name in CANDIDATES]
    for path in paths:
        if path.exists():
            return json.loads(path.read_text()).get("tests_by_mangled_function_name", {})
    return {}


def _module(function):
    return function.rpartition(".x")[0]


def first_callers(associations, thin=THIN, spread=SPREAD):
    reach = defaultdict(set)
    for function, tests in associations.items():
        if len(tests) <= thin:
            for test in tests:
                reach[test].add(_module(function))
    return {test for test, modules in reach.items() if len(modules) >= spread}


def at_risk(associations, thin=THIN, spread=SPREAD):
    """Function -> its traced tests, for functions reached only by first callers."""
    callers = first_callers(associations, thin, spread)
    return {
        function: sorted(tests)
        for function, tests in associations.items()
        if 0 < len(tests) <= thin and set(tests) <= callers
    }


def main(argv):
    associations = traced(argv[0] if argv else None)
    if not associations:
        print("no stats map found - run `mutmut run` once to build one")
        return 1
    risky = at_risk(associations)
    print(f"{len(associations):,} functions traced, {len(risky):,} reached only by a first caller\n")
    for function, tests in sorted(risky.items()):
        print(f"  {function}")
        for test in tests:
            print(f"      {test}")
    if risky:
        print(
            "\nEach of these runs once per process, so its mutation never executes in a mutant's fork."
            " Kill them with a test that declares the thing in its own body and then uses it."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
