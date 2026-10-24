"""Find the survivors of ONE source file against the tests you name, in parallel, in a private copy.

Skips the stats pass. Scoped tests make this an upper bound on survivors, never an under-report.

    python -m scripts.toolbox.hunt apps/users/adapters.py apps/users/tests/test_adapters.py
    python -m scripts.toolbox.hunt <source.py> <tests...> --only <mutant name>   # settle one mutant
    HUNT_JOBS=6 HUNT_DB_PREFIX=abc MUTMUT_DB_TEMPLATE=... python -m scripts.toolbox.hunt ...

`MUTMUT_DB_TEMPLATE` (`python scripts/mutation_template.py name`) clones rather than migrates per mutant.
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


# The registries too: a test reads them, and one that raises scores every mutant killed.
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

# Not kills: these mean nothing ran.
PYTEST_USAGE_ERROR = 4
PYTEST_NOTHING_COLLECTED = 5


def build_workdir(where):
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
    # Not the submit index: two concurrent mutants sharing a database would kill each other.
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
    # Checked in the copy, before a sweep that would run nothing.
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
