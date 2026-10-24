"""pytest plugin: run a mutant's tests cheapest-first (mutmut's set loses its ordering), last killers first.

Also logs each mutant's killer and cost. Not mutated itself: it decides the order.
"""

import json
import os
import sys
import time
from json import JSONDecodeError
from pathlib import Path


# pytest may run from the repo root or from `mutants/`.
CANDIDATES = ("mutants/mutmut-stats.json", "mutmut-stats.json")
KILLERS = ("mutants/mutmut-killers.json", "mutmut-killers.json")
LOG = ("mutants/mutmut-mutants.jsonl", "mutmut-mutants.jsonl")

_durations: dict[str, float] = {}
_started = 0.0
_ran = 0
_killer = None


NOT_A_MUTANT = {"", "stats", "mutant_generation", "list_all_tests"}


def pytest_configure(config):
    del config
    global _started
    _started = time.monotonic()
    named = os.environ.get("MUTMUT_STATS")
    for path in [Path(named)] if named else [Path(p) for p in CANDIDATES]:
        if path.exists():
            _durations.update(json.loads(path.read_text()).get("duration_by_test", {}))
            return
    # Normal for the stats pass; with a mutant selected it silently makes the run much slower.
    if os.environ.get("MUTANT_UNDER_TEST", "") not in NOT_A_MUTANT:
        print(
            "mutation_test_order: no stats map found, tests will run unordered and the run will be many times dearer",
            file=sys.stderr,
        )


def _function_under_test():
    mutant = os.environ.get("MUTANT_UNDER_TEST", "")
    return "" if mutant in NOT_A_MUTANT else mutant.rpartition("__mutmut_")[0]


def _memory_path():
    return next((Path(p) for p in KILLERS if Path(p).parent.exists()), Path(KILLERS[-1]))


def _log_path():
    return next((Path(p) for p in LOG if Path(p).parent.exists()), Path(LOG[-1]))


def _remembered():
    function = _function_under_test()
    path = _memory_path()
    if not function or not path.exists():
        return []
    try:
        return json.loads(path.read_text()).get(function, [])
    except JSONDecodeError:
        return []


def pytest_collection_modifyitems(items):
    if not _durations:
        return
    # Unmeasured sorts last, not ahead of tests known to be instant.
    items.sort(key=lambda item: _durations.get(item.nodeid, float("inf")))
    killers = _remembered()
    if killers:
        # Stable sort keeps the cheapest-first order behind them.
        items.sort(key=lambda item: killers.index(item.nodeid) if item.nodeid in killers else len(killers))


def pytest_runtest_logreport(report):
    """Remember the killer for this function's next mutant. One shared file: assumes mutmut runs one child."""
    global _ran, _killer
    function = _function_under_test()
    if report.when == "call":
        _ran += 1
    if report.outcome != "failed" or not function:
        return
    _killer = _killer or report.nodeid
    path = _memory_path()
    try:
        remembered = json.loads(path.read_text()) if path.exists() else {}
    except JSONDecodeError:
        remembered = {}
    kept = [report.nodeid] + [name for name in remembered.get(function, []) if name != report.nodeid][:1]
    if remembered.get(function) == kept:
        return
    remembered[function] = kept
    path.write_text(json.dumps(remembered))


def pytest_sessionfinish(session, exitstatus):
    """Append this mutant's killer and cost; appending keeps earlier lines if the run is killed."""
    del session, exitstatus
    mutant = os.environ.get("MUTANT_UNDER_TEST", "")
    if mutant in NOT_A_MUTANT:
        return
    record = {"mutant": mutant, "killer": _killer, "seconds": round(time.monotonic() - _started, 3), "tests": _ran}
    with _log_path().open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")
