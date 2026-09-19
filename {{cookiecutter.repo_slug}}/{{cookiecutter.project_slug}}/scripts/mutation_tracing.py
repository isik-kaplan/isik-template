"""The functions phase one cannot kill, named before a run rather than discovered hours into one.

A function that runs once per process - at import, while Django builds a model class, behind an
`lru_cache` - has already run in the parent mutmut forks from, so its mutation never executes and
phase one reports a survivor only phase two can settle. The stats map shows it: such a function is
traced to whichever test first demanded it, so one test ends up the sole tracer across unrelated
modules. The fix is a test that declares the thing in its own body; this only says where to write one.

    python scripts/mutation_tracing.py [path/to/stats.json]
"""

import json
import sys
from collections import defaultdict
from pathlib import Path


CANDIDATES = ("mutants/mutmut-stats.json", "mutmut-stats.json")

# A function traced by one or two tests is thin enough to be an accident. Above that, whichever test
# ran first stops being the only one that can kill it.
THIN = 2
# A test that is the sole tracer for thin functions in this many separate modules is not their
# caller, it is whatever happened to run first. Two is already a coincidence worth reading.
SPREAD = 2


def traced(stats_path=None):
    """Function -> the tests mutmut associated with it, or {} when no map has been built."""
    paths = [Path(stats_path)] if stats_path else [Path(name) for name in CANDIDATES]
    for path in paths:
        if path.exists():
            return json.loads(path.read_text()).get("tests_by_mangled_function_name", {})
    return {}


def _module(function):
    """The module a mangled name belongs to - everything before mutmut's `x` prefix."""
    return function.rpartition(".x")[0]


def first_callers(associations, thin=THIN, spread=SPREAD):
    """The tests that trace thin functions across unrelated modules."""
    reach = defaultdict(set)
    for function, tests in associations.items():
        if len(tests) <= thin:
            for test in tests:
                reach[test].add(_module(function))
    return {test for test, modules in reach.items() if len(modules) >= spread}


def at_risk(associations, thin=THIN, spread=SPREAD):
    """Function -> its traced tests, for functions nothing but a first caller reaches.

    Every test in the set has to be a first caller. One genuine caller is enough to kill a mutant,
    and the whole point of the report is that these have none.
    """
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
