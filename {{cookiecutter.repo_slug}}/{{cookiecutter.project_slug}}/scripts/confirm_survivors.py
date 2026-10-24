"""Phase two: re-run every unsettled mutant against the whole suite, one process per mutant.

Tracing can miss a killing test but never invent one, so phase-one kills are final and only
survived/timeout/not-checked/no-tests mutants come here. Results are saved per mutant, so a rerun resumes.

    python scripts/confirm_survivors.py --queue unsettled.txt --jobs 6
"""

import argparse
import fcntl
import json
import os
import re
import signal
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from queue import SimpleQueue
from threading import Lock

import tomllib

from scripts.mutation_queue import EQUIVALENTS, EXEMPTIONS, function_of


ROOT = Path(__file__).resolve().parent.parent
MUTANTS = ROOT / "mutants"
REPORT = MUTANTS / "mutmut-confirmed.json"
# Long enough that "equivalent" or "n/a" cannot pass for an explanation.
SHORTEST_USEFUL_REASON = 40

# 2 is a kill only alongside a reported failure: under xdist `-x` exits 2, as does a real interrupt.
SURVIVED, FAILURES, INTERRUPTED = 0, 1, 2

# Hung, not slow. Overridable: a loaded machine needs longer.
WALL_LIMIT = int(os.environ.get("MUTMUT_WALL_LIMIT", "900"))

# Short because Postgres truncates at 63 and the whole name is `test_<database>_p2<run><slot>_<worker>`.
RUN = f"{os.getpid() % 1000:03d}"


def _load(path):
    """A registry's entries; one without a real reason is rejected."""
    if not path.exists():
        return {}
    entries = tomllib.loads(path.read_text())
    for name, entry in entries.items():
        # An unquoted `[a.b.c]` is a nested TOML table, not a dotted key.
        if not isinstance(entry, dict) or any(isinstance(value, dict) for value in entry.values()):
            raise SystemExit(
                f"{path.name}: [{name}] is a nested table, so the mutant name was not quoted. "
                'Write ["<the whole dotted name>"] instead - TOML reads the dots as table nesting.'
            )
        reason = entry.get("reason", "").strip()
        if len(reason) < SHORTEST_USEFUL_REASON:
            raise SystemExit(f"{path.name}: {name} needs a reason, and {reason!r} is not one")
    return entries


def load_equivalents():
    entries = _load(EQUIVALENTS)
    for name, entry in entries.items():
        # A positional name moves with any edit above it and silently excuses a different mutation.
        if not re.search(r"__mutmut__[0-9a-f]{12}(_[0-9]+)?$", name):
            raise SystemExit(
                f"{EQUIVALENTS.name}: {name} is not named by its mutation - generate the name with "
                "scripts/mutation_naming.py applied (see the file's header)."
            )
        # Shape only; the suite asserts that the test exists.
        verified_by = entry.get("verified_by")
        if verified_by is not None and (not isinstance(verified_by, str) or "::" not in verified_by):
            raise SystemExit(
                f"{EQUIVALENTS.name}: {name} has verified_by {verified_by!r}, which is not a test's "
                "node id - write `<path>::<test name>`."
            )
    return entries


def load_exemptions():
    entries = _load(EXEMPTIONS)
    for name in entries:
        if "__mutmut_" in name:
            raise SystemExit(
                f"{EXEMPTIONS.name}: {name} names one mutant, and this file is keyed by function. A "
                f"single mutant no test can kill belongs in {EQUIVALENTS.name}."
            )
    return entries


def mutants_in_tree():
    names = set()
    for meta in MUTANTS.rglob("*.py.meta"):
        try:
            names.update(json.loads(meta.read_text()).get("exit_code_by_key", {}))
        except (OSError, json.JSONDecodeError):
            continue
    return names


def run_one(name, xdist, slot):
    environment = {
        **os.environ,
        "MUTANT_UNDER_TEST": name,
        # Slot numbers repeat across concurrent runs.
        "MUTMUT_DB_SUFFIX": f"p2{RUN}{slot}",
        "PY_IGNORE_IMPORTMISMATCH": "1",
    }
    command = [sys.executable, "-m", "pytest", "-x", "-q", "--no-cov", "-n", str(xdist), "--dist", "loadfile"]
    # Own process group: a timeout kills only the direct child, and xdist workers would hold the pipe open.
    process = subprocess.Popen(
        command,
        cwd=MUTANTS,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    try:
        output, _ = process.communicate(timeout=WALL_LIMIT)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass
        output, _ = process.communicate()
        return "timeout", f"no verdict within {WALL_LIMIT}s"
    completed = subprocess.CompletedProcess(command, process.returncode, output, "")
    # Errors count as kills: a mutant breaking model wiring errors the fixtures rather than failing a test.
    reported_a_failure = re.search(r"\d+ (failed|error)", completed.stdout) is not None
    if completed.returncode == FAILURES or (completed.returncode == INTERRUPTED and reported_a_failure):
        return "killed", None
    if completed.returncode == SURVIVED:
        return "survived", None
    # Keep the exit code: the output tail alone can't tell an error from a kill.
    return "error", f"exit {completed.returncode}\n{completed.stdout[-600:]}"


def record(name, result):
    """Merge one verdict under a lock, so concurrent runs against one tree don't drop each other's."""
    # Derived from REPORT, not the tree root, which differs when run from inside `mutants/`.
    with open(REPORT.with_name(REPORT.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        on_disk = json.loads(REPORT.read_text()) if REPORT.exists() else {}
        on_disk[name] = result
        # Rename, not write in place: a kill mid-`write_text` would leave an empty report.
        staged = REPORT.with_name(REPORT.name + ".staged")
        staged.write_text(json.dumps(on_disk, indent=2, sort_keys=True))
        os.replace(staged, REPORT)
    return on_disk


def tree_is_sound(slot):
    """The suite with no mutant must pass, or every kill is the broken tree. Checked again at the end
    because a mutant can damage the tree (e.g. empty `mutants/pyproject.toml`) mid-run."""
    verdict, detail = run_one("", 0, slot)
    return verdict == "survived", verdict if detail is None else f"{verdict} - {detail}"


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", required=True, help="file of `<mutant name>: <phase one verdict>` lines")
    parser.add_argument("--jobs", type=int, default=6, help="mutants confirmed at once")
    parser.add_argument("--xdist", type=int, default=0, help="pytest workers within each (0, see below)")
    arguments = parser.parse_args(argv)

    if arguments.xdist:
        raise SystemExit(
            f"--xdist {arguments.xdist} would report every mutant as killed. One xdist worker is enough "
            "to defeat pytest-django's ordering of transaction=True tests, and the flush that follows "
            "fails the suite for reasons that have nothing to do with the mutant. Use --jobs instead."
        )

    equivalents, exemptions = load_equivalents(), load_exemptions()

    def registered(name):
        return name in equivalents or function_of(name) in exemptions

    unsettled = []
    for line in Path(arguments.queue).read_text().splitlines():
        name = line.rpartition(": ")[0].strip() or line.strip()
        if name:
            unsettled.append(name)

    # A registered mutant in the tree but not the queue was killed. Judged against the tree: the queue is a slice.
    in_tree = mutants_in_tree()
    stale = sorted({name for name in in_tree if registered(name)} - set(unsettled))
    if stale:
        raise SystemExit(
            f"{EQUIVALENTS.name}/{EXEMPTIONS.name} register mutant(s) this tree holds but its queue does "
            "not: " + ", ".join(stale) + " - each was killed, so its entry is obsolete. Remove it."
        )
    queue = [name for name in unsettled if not registered(name)]

    # Only kill and survival are terminal; an interrupted run writes `error`.
    settled = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    # Drop verdicts cached before the mutant was exempted, or the gate keeps failing on them.
    settled = {name: result for name, result in settled.items() if not registered(name)}
    decided = {name for name, result in settled.items() if result.get("verdict") in ("killed", "survived")}
    todo = [name for name in queue if name not in decided]
    print(f"{len(queue)} queued, {len(decided)} already settled, {len(todo)} to run", flush=True)

    sound, output = tree_is_sound(0)
    if not sound:
        raise SystemExit(
            "the suite this run settles mutants against does not pass with no mutant selected, so every"
            f" mutant would be recorded as killed. Rebuild the tree. The control run's own verdict was: {output}"
        )

    lock = Lock()
    counter = {"done": 0, "killed": 0, "survived": 0, "timeout": 0, "error": 0}

    # Not `index % jobs`: out-of-order finishes would share a slot and drop each other's database.
    free_slots = SimpleQueue()
    for slot_number in range(arguments.jobs):
        free_slots.put(slot_number)

    def confirm(name):
        slot = free_slots.get()
        # `pool.map` defers exceptions until iteration, so a raise would record no verdict.
        try:
            verdict, detail = run_one(name, arguments.xdist, slot)
        except Exception as exception:  # noqa: BLE001
            verdict, detail = "error", f"{type(exception).__name__}: {exception}"
        finally:
            free_slots.put(slot)
        with lock:
            settled[name] = {"verdict": verdict, "detail": detail}
            settled.update(record(name, settled[name]))
            counter["done"] += 1
            counter[verdict] += 1
            print(
                f"{counter['done']}/{len(todo)} {verdict:9} killed={counter['killed']} "
                f"survived={counter['survived']} timeout={counter['timeout']} error={counter['error']}  {name}",
                flush=True,
            )

    with ThreadPoolExecutor(max_workers=arguments.jobs) as pool:
        list(pool.map(confirm, todo))

    sound, output = tree_is_sound(0)
    if not sound:
        raise SystemExit(
            "the suite passed before this run and does not now, so a mutant damaged the tree partway"
            " through and every kill after it is unearned. Rebuild the tree and run again; the verdicts"
            f" written so far cannot be told apart. The control run's own verdict was: {output}"
        )

    # Written even when nothing ran: an absent report reads to the gate as no phase two.
    REPORT.write_text(json.dumps(settled, indent=2, sort_keys=True))

    real = sorted(name for name, result in settled.items() if result["verdict"] == "survived")
    print(f"\nconfirmed survivors: {len(real)}")
    for name in real:
        print(f"  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
