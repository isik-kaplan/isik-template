"""Run a mutant's tests cheapest-first, which is what mutmut intends and does not get.

`tests_for_mutant_names` returns a set, so most of a mutant's tests tie at the recorded floor and
set-iteration order decides instead. A mutant that dies on a millisecond test can end up paying for
every expensive one that also covers it, in whatever order a set happens to iterate.

It also tries the tests that killed this function's last two mutants first, and writes down what each
mutant cost. Registered through `[tool.mutmut] pytest_add_cli_args`, and kept out of the mutation set:
mutating the thing that decides the order would be circular.
"""

import json
import os
import sys
import time
from json import JSONDecodeError
from pathlib import Path


# pytest runs from the repo root while the map sits under `mutants/`. Getting it wrong is silent: the
# plugin orders nothing and the run quietly costs what it always did.
CANDIDATES = ("mutants/mutmut-stats.json", "mutmut-stats.json")
KILLERS = ("mutants/mutmut-killers.json", "mutmut-killers.json")
# What killed each mutant, how long it took, how many tests ran first. mutmut records only a verdict,
# so without this a run's cost is one number that hides its own shape.
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
    # No map is normal for the stats pass itself, which runs before one exists. It is not normal once
    # a mutant is selected, and saying so is the difference between a slow run and a silent one.
    if os.environ.get("MUTANT_UNDER_TEST", "") not in NOT_A_MUTANT:
        print(
            "mutation_test_order: no stats map found, tests will run unordered and the run will be many times dearer",
            file=sys.stderr,
        )


def _function_under_test():
    """The mangled function a mutant belongs to, or "" when nothing is selected."""
    mutant = os.environ.get("MUTANT_UNDER_TEST", "")
    return "" if mutant in NOT_A_MUTANT else mutant.rpartition("__mutmut_")[0]


def _memory_path():
    return next((Path(p) for p in KILLERS if Path(p).parent.exists()), Path(KILLERS[-1]))


def _log_path():
    return next((Path(p) for p in LOG if Path(p).parent.exists()), Path(LOG[-1]))


def _remembered():
    """The tests that killed this function's last two mutants, newest first."""
    function = _function_under_test()
    path = _memory_path()
    if not function or not path.exists():
        return []
    try:
        return json.loads(path.read_text()).get(function, [])
    except JSONDecodeError:
        # A half-written file from an interrupted run costs the ordering, not the run.
        return []


def pytest_collection_modifyitems(items):
    if not _durations:
        return
    # An unmeasured test sorts last rather than first: it is usually a new one, and guessing it is
    # instant would put it ahead of tests actually known to be instant.
    items.sort(key=lambda item: _durations.get(item.nodeid, float("inf")))
    killers = _remembered()
    if killers:
        # Stable, so everything behind them keeps the cheapest-first order this just sorted into,
        # and the newer killer goes first because it is the likelier of the two.
        items.sort(key=lambda item: killers.index(item.nodeid) if item.nodeid in killers else len(killers))


def pytest_runtest_logreport(report):
    """Remember the test that objected, so the next mutant of this function starts there.

    A mutant run stops at the first failure, so this test is the one that killed it. Read back by
    `_remembered`. Safe while mutmut runs one child at a time, which it is pinned to; concurrent
    children would need this to be per-child rather than one shared file.
    """
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
    """What this mutant cost, written where the next question about it can be answered by sorting.

    Appended rather than merged: one child at a time, one line each, and a run killed halfway leaves
    the lines it already wrote. The phases that select no mutant write nothing - their cost belongs to
    the suite rather than to any mutant.
    """
    del session, exitstatus
    mutant = os.environ.get("MUTANT_UNDER_TEST", "")
    if mutant in NOT_A_MUTANT:
        return
    record = {"mutant": mutant, "killer": _killer, "seconds": round(time.monotonic() - _started, 3), "tests": _ran}
    with _log_path().open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")
