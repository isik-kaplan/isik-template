"""Phase two: re-run every unsettled mutant against the whole suite.

Phase one tests each mutant against only the tests mutmut's tracing associates with it. That is cheap
and wrong in exactly one direction: tracing can miss a test that would have killed the mutant, but it
cannot invent one that kills a mutant the suite would have let live. So a kill in phase one is final,
and everything tracing gets wrong arrives here.

Three kinds of mutant land in this queue, and only the first is what the name suggests:

  * survived - tracing found no test that objected, which may or may not be true of the whole suite.
  * timeout  - shot for running past its wall limit, which under concurrent runs says more about the
               load than about the mutant.
  * not checked - never ran at all.

Each is re-run in its own process with the whole suite behind it. `-x` means a mutant that does die
stops at the first test to object, so only genuine survivors pay for a full pass. A separate process
per mutant also sidesteps what phase one cannot avoid: mutmut runs thousands of pytest sessions in one
interpreter, where anything a session leaves behind is the next session's problem.

Usage:

    python scripts/confirm_survivors.py --queue unsettled.txt
    python scripts/confirm_survivors.py --queue unsettled.txt --jobs 6

Results are written after every mutant, so an interrupted run resumes rather than restarting.
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

from scripts.mutation_fingerprint import drifted, mangled_function


ROOT = Path(__file__).resolve().parent.parent
MUTANTS = ROOT / "mutants"
REPORT = MUTANTS / "mutmut-confirmed.json"
EXEMPTIONS = ROOT / "mutation-exemptions.toml"
# Long enough that "equivalent" or "n/a" cannot pass for an explanation.
SHORTEST_USEFUL_REASON = 40

# 2 is a kill only when pytest also reported a failure: under xdist `-x` raises rather than stopping
# cleanly, and a genuine interrupt looks the same.
SURVIVED, FAILURES, INTERRUPTED = 0, 1, 2

# Past this it is hung, not slow. Overridable because that is a property of the machine: a loaded
# laptop takes longer, where every survivor times out and takes the control run with it.
WALL_LIMIT = int(os.environ.get("MUTMUT_WALL_LIMIT", "900"))

# Short because Postgres truncates at 63 and the whole name is `test_<database>_p2<run><slot>_<worker>`.
RUN = f"{os.getpid() % 1000:03d}"


def load_exemptions():
    """Mutants no test can kill because the mutated code behaves identically, or a mutmut tooling gap.

    An escape hatch from a policy, so it is guarded like one: an entry without a real explanation is
    rejected here rather than quietly shrinking the survivor list.
    """
    if not EXEMPTIONS.exists():
        return {}
    entries = tomllib.loads(EXEMPTIONS.read_text())
    for name, entry in entries.items():
        # A bare `[a.b.c]` header is a nested table in TOML, not a key called "a.b.c", so a mutant's
        # dotted name has to be quoted - unquoted it matches nothing and reads as having no reason.
        if not isinstance(entry, dict) or any(isinstance(value, dict) for value in entry.values()):
            raise SystemExit(
                f"{EXEMPTIONS.name}: [{name}] is a nested table, so the mutant name was not quoted. "
                'Write ["<the whole dotted name>"] instead - TOML reads the dots as table nesting.'
            )
        reason = entry.get("reason", "").strip()
        if len(reason) < SHORTEST_USEFUL_REASON:
            raise SystemExit(f"{EXEMPTIONS.name}: {name} needs a reason, and {reason!r} is not one")
    # A mutant's number is its position inside its own function, so editing that function hands the
    # name to a different mutation and leaves the reason describing one nobody exempted.
    moved = drifted(entries, ROOT)
    if moved:
        raise SystemExit(
            f"{EXEMPTIONS.name}: {len(moved)} entr{'y' if len(moved) == 1 else 'ies'} written against a"
            " version of the function that has since changed, so the number now names a different"
            " mutation. Re-read each one, confirm the reason still describes it, then record the new"
            " fingerprint:\n"
            + "\n".join(f"  {name}  {recorded or 'none'} -> {current}" for name, recorded, current in moved)
        )
    return entries


def mutants_in_tree():
    """Every mutant name this tree was built for, read from the per-file metadata mutmut writes."""
    names = set()
    for meta in MUTANTS.rglob("*.py.meta"):
        try:
            names.update(json.loads(meta.read_text()).get("exit_code_by_key", {}))
        except (OSError, json.JSONDecodeError):
            continue
    return names


def run_one(name, xdist, slot):
    """The whole suite, with this one mutant active."""
    environment = {
        **os.environ,
        "MUTANT_UNDER_TEST": name,
        # The run is in the name because slot numbers repeat across concurrent processes.
        "MUTMUT_DB_SUFFIX": f"p2{RUN}{slot}",
        "PY_IGNORE_IMPORTMISMATCH": "1",
    }
    command = [sys.executable, "-m", "pytest", "-x", "-q", "--no-cov", "-n", str(xdist), "--dist", "loadfile"]
    # Its own process group: `subprocess.run(timeout=...)` kills only its direct child, and xdist
    # workers outlive it holding the stdout pipe.
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
            # It exited between the timeout expiring and the kill, which is not an error here.
            pass
        output, _ = process.communicate()
        # Not every mutant fails a test - some make one hang. Counted apart from a survivor, because a
        # suite that never finishes has not passed.
        return "timeout", f"no verdict within {WALL_LIMIT}s"
    completed = subprocess.CompletedProcess(command, process.returncode, output, "")
    # Errors count with failures: a mutant that breaks model wiring takes the fixtures down with it, so
    # the suite errors rather than fails, and the suite objecting is what a kill is.
    reported_a_failure = re.search(r"\d+ (failed|error)", completed.stdout) is not None
    if completed.returncode == FAILURES or (completed.returncode == INTERRUPTED and reported_a_failure):
        return "killed", None
    if completed.returncode == SURVIVED:
        return "survived", None
    # The code is recorded, not only the output. Without it an error cannot be told apart from a kill
    # after the fact: the tail shows pytest objecting either way, and which one it was is the code.
    return "error", f"exit {completed.returncode}\n{completed.stdout[-600:]}"


def record(name, result):
    """One verdict into the report, merged under a lock rather than written from memory.

    Two runs against one tree each hold the whole report, so the last to write drops everything the
    other settled - silently, and toward "survived", since a verdict that was never recorded reads as
    one that was never taken.
    """
    # Both paths are derived from REPORT rather than from the tree root, which resolves to a different
    # directory when the suite runs from inside `mutants/`.
    with open(REPORT.with_name(REPORT.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        on_disk = json.loads(REPORT.read_text()) if REPORT.exists() else {}
        on_disk[name] = result
        # Staged and renamed rather than written in place: `write_text` truncates before it writes, and
        # a run killed in that window would leave no verdicts at all rather than the last ones.
        staged = REPORT.with_name(REPORT.name + ".staged")
        staged.write_text(json.dumps(on_disk, indent=2, sort_keys=True))
        os.replace(staged, REPORT)
    return on_disk


def tree_is_sound(slot):
    """The suite, with no mutant selected, which must pass before a kill means anything.

    A kill is `pytest objected`, and pytest objects just as loudly when the tree it is running in is
    broken - so a run against a damaged tree reports every mutant killed and reads as a perfect score.
    That is exactly what a mutant emptying `mutants/pyproject.toml` mid-run produces.

    Checked again at the end, because the damage is done by a mutant partway through: everything before
    it was measured against a sound tree and everything after it against a ruin.
    """
    verdict, detail = run_one("", 0, slot)
    return verdict == "survived", verdict if detail is None else f"{verdict} - {detail}"


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", required=True, help="file of `<mutant name>: <phase one verdict>` lines")
    parser.add_argument("--jobs", type=int, default=6, help="mutants confirmed at once")
    # 0, and it may not be raised: one worker defeats pytest-django's ordering of transaction=True
    # tests, and the flush that follows is recorded as the mutant's kill.
    parser.add_argument("--xdist", type=int, default=0, help="pytest workers within each (0, see below)")
    arguments = parser.parse_args(argv)

    if arguments.xdist:
        raise SystemExit(
            f"--xdist {arguments.xdist} would report every mutant as killed. One xdist worker is enough "
            "to defeat pytest-django's ordering of transaction=True tests, and the flush that follows "
            "fails the suite for reasons that have nothing to do with the mutant. Use --jobs instead."
        )

    exemptions = load_exemptions()
    unsettled = []
    for line in Path(arguments.queue).read_text().splitlines():
        name = line.rpartition(": ")[0].strip() or line.strip()
        if name:
            unsettled.append(name)

    # An exemption this tree holds but did not queue is a hole nobody chose. Judged against the tree,
    # since the file covers a codebase the queue is only a slice of. Expanded from function names to
    # mutant names first: the file is keyed by function, and a mutant's own name never appears in it.
    in_tree = mutants_in_tree()
    exempt_mutants = {name for name in in_tree if mangled_function(name) in exemptions}
    stale = sorted(exempt_mutants - set(unsettled))
    if stale:
        raise SystemExit(
            f"{EXEMPTIONS.name} exempts mutant(s) this tree holds but its queue does not: "
            + ", ".join(stale)
            + " - each was killed or no longer exists, so the exemption is obsolete. Remove it."
        )
    queue = [name for name in unsettled if mangled_function(name) not in exemptions]

    # Only a kill and a survival are terminal: an interrupted run writes `error` for everything it held.
    settled = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    # The gate reads the report, so a verdict cached before its mutant was exempted would keep failing.
    settled = {name: result for name, result in settled.items() if mangled_function(name) not in exemptions}
    decided = {name for name, result in settled.items() if result.get("verdict") in ("killed", "survived")}
    todo = [name for name in queue if name not in decided]
    print(f"{len(queue)} queued, {len(decided)} already settled, {len(todo)} to run", flush=True)

    sound, output = tree_is_sound(0)
    if not sound:
        # The output, not just the verdict: a damaged tree, a test failing for its own reasons and an
        # expired wall limit are told apart only by what pytest said.
        raise SystemExit(
            "the suite this run settles mutants against does not pass with no mutant selected, so every"
            f" mutant would be recorded as killed. Rebuild the tree. The control run's own verdict was: {output}"
        )

    lock = Lock()
    counter = {"done": 0, "killed": 0, "survived": 0, "timeout": 0, "error": 0}

    # Handed out rather than `index % jobs`: items finish out of order, so two would share a slot and
    # the newcomer would drop the other's database - whose mass failure is then recorded as a kill.
    free_slots = SimpleQueue()
    for slot_number in range(arguments.jobs):
        free_slots.put(slot_number)

    def confirm(name):
        slot = free_slots.get()
        # Caught, not raised: `ThreadPoolExecutor.map` holds an exception until the results are
        # iterated, so a raise here would record no verdict.
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

    # Written even when nothing ran, which is what a tree whose every survivor is exempt produces. An
    # absent report reads to the gate as a phase two that never happened.
    REPORT.write_text(json.dumps(settled, indent=2, sort_keys=True))

    real = sorted(name for name, result in settled.items() if result["verdict"] == "survived")
    print(f"\nconfirmed survivors: {len(real)}")
    for name in real:
        print(f"  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
