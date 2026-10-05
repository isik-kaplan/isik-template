"""Find the survivors of ONE source file against the tests you name, in parallel and isolated.

A full run pays for the whole-suite stats pass before testing anything. For one file whose own tests
are fast this skips it: write the mutated file once, then select each mutant by `MUTANT_UNDER_TEST`,
so the file never changes between mutants and they can all run at once.

Every hunt works in a private copy of the project, so the real tree is never written to: a killed
hunt leaves no mutated source behind, and hunts can run beside each other and beside a normal test
run. The virtualenv is linked rather than copied.

Scoped tests make this an *upper* bound on survivors - a mutant another test file kills reads as
surviving here - which is the safe direction: it over-reports work and never hides a survivor.
Survivors a registry already accounts for are listed apart, so they are not re-diagnosed.

    python -m scripts.toolbox.hunt apps/users/adapters.py apps/users/tests/test_adapters.py
    python -m scripts.toolbox.hunt <source.py> <tests...> --only <mutant name>   # settle one mutant
    HUNT_JOBS=6 HUNT_DB_PREFIX=abc MUTMUT_DB_TEMPLATE=... python -m scripts.toolbox.hunt ...

`MUTMUT_DB_TEMPLATE` (from `python scripts/mutation_template.py build`/`name`) makes each session
clone a database rather than migrate one; without it every mutant pays for migrations.
"""

import argparse
import concurrent.futures
import os
import queue
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from scripts.mutation_queue import ROOT
from scripts.toolbox.generated import is_registered, mutated, names_in, registered


# What a test session inside the copy reads. The registries are here because a test reads them, and
# a test that raises scores every mutant as killed.
COPIED = (
    "apps",
    "{{ cookiecutter.project_slug }}",
    "scripts",
    "templates",
    "locale",
    "conftest.py",
    "manage.py",
    "pyproject.toml",
    "mutation-equivalents.toml",
    "mutation-exemptions.toml",
)
LINKED = (".venv",)

# pytest's exit codes are not a kill/survive bit: 1 is a failing test, which is a kill, but reading a
# usage error or an empty collection as one scores every mutant killed having run nothing.
PYTEST_USAGE_ERROR = 4
PYTEST_NOTHING_COLLECTED = 5


def build_workdir(where):
    """A private copy that imports as the real project."""
    shutil.rmtree(where, ignore_errors=True)
    where.mkdir(parents=True)
    for name in COPIED:
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, where / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "mutants"))
        elif source.exists():
            shutil.copy2(source, where / name)
    for name in LINKED:
        if (ROOT / name).exists():
            (where / name).symlink_to(ROOT / name)


def run_one(name, tests, slots, workdir, timeout):
    """(name, killed) for one mutant against the named tests."""
    # Taken when the work starts rather than derived from the submit index: two mutants running at
    # once must never share a database, or one's broken session reads as the other's kill.
    slot = slots.get()
    try:
        environment = {
            **os.environ,
            "MUTANT_UNDER_TEST": name,
            "MUTMUT_DB_SUFFIX": f"{os.environ.get('HUNT_DB_PREFIX', 'hunt')}{slot}",
            "PY_IGNORE_IMPORTMISMATCH": "1",
        }
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pytest", *tests, "-q", "--no-cov", "-n", "0", "-x"],
                capture_output=True,
                text=True,
                env=environment,
                cwd=workdir,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            # A mutant that hangs was not killed - nothing asserted anything about it.
            print(f"  timed out (reported as surviving): {name}", flush=True)
            return name, False
        if result.returncode in (PYTEST_USAGE_ERROR, PYTEST_NOTHING_COLLECTED):
            raise SystemExit(
                f"pytest exited {result.returncode} for {name}: it ran no tests, so no verdict is possible."
                f" Check the test paths.\n{result.stdout[-2000:]}"
            )
        return name, result.returncode != 0
    finally:
        slots.put(slot)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="the source file to mutate, relative to the project root")
    parser.add_argument("tests", nargs="+", help="test paths to run each mutant against")
    parser.add_argument("--only", action="append", default=[], help="hunt just this mutant (repeatable)")
    options = parser.parse_args(argv)

    jobs = int(os.environ.get("HUNT_JOBS", "4"))
    timeout = float(os.environ.get("HUNT_TIMEOUT", "1500"))
    workdir = Path(tempfile.mkdtemp(prefix="hunt-"))
    build_workdir(workdir)
    # pytest runs inside the copy, so a test path is only real if it resolves there - checked now
    # rather than after a sweep that ran nothing.
    missing = [test for test in options.tests if not (workdir / test.partition("::")[0]).exists()]
    if missing:
        raise SystemExit(f"test paths that do not exist: {' '.join(missing)}")

    names = names_in(options.source)
    if options.only:
        unknown = sorted(set(options.only) - set(names))
        if unknown:
            raise SystemExit(f"{options.source} generates no mutant named: {', '.join(unknown)}")
        names = options.only
    (workdir / options.source).write_text(mutated(options.source).code)

    print(f"{len(names)} mutants in {options.source}, {jobs} at a time, in {workdir}", flush=True)
    survivors = []
    try:
        slots = queue.Queue()
        for slot in range(jobs):
            slots.put(slot)
        with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
            futures = [pool.submit(run_one, name, options.tests, slots, workdir, timeout) for name in names]
            for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
                name, killed = future.result()
                if not killed:
                    survivors.append(name)
                if done % 25 == 0:
                    print(f"  {done}/{len(names)}  survivors so far: {len(survivors)}", flush=True)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    single, whole = registered()
    known = sorted(name for name in survivors if is_registered(name, single, whole))
    new = sorted(set(survivors) - set(known))
    print(f"\n{len(new)} survived with no registry entry:")
    for name in new:
        print(f"  {name}")
    if known:
        print(f"\n{len(known)} more survived and are already registered:")
        for name in known:
            print(f"  {name}")
    return 1 if new else 0


if __name__ == "__main__":
    sys.exit(main())
