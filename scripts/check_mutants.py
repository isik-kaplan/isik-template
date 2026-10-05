#!/usr/bin/env python3
"""Fails unless every mutant `mutmut run` left alive is named in mutation-exemptions.toml, and every
name there is still a mutant left alive. Run right after `scripts/mutmut_run.py run` - it reads
`mutmut results`.

Entries are keyed by mutant, named after the mutation itself (scripts/mutation_naming.py), so an entry
excuses exactly the mutation its reason describes: a new mutant in the same function needs its own,
and an edit that removes the mutation leaves the entry stale - which fails here rather than quietly
excusing nothing.
"""

import subprocess
import sys
import tomllib
from pathlib import Path


EXEMPTIONS_PATH = Path(__file__).resolve().parent.parent / "mutation-exemptions.toml"
# Everything else mutmut can report is a mutant nothing killed: "no tests" was never run, "timeout"
# and "suspicious" were given up on, "not checked" never reached - none of them is a pass.
SETTLED = ("killed", "skipped", "caught by type check")


def alive(results):
    """{mutant name: verdict} for every line of `mutmut results` that is not a settled verdict."""
    found = {}
    for line in results.splitlines():
        name, _, verdict = line.strip().rpartition(": ")
        if name and verdict not in SETTLED:
            found[name] = verdict
    return found


def main() -> int:
    exemptions = tomllib.loads(EXEMPTIONS_PATH.read_text()) if EXEMPTIONS_PATH.exists() else {}
    result = subprocess.run(["mutmut", "results", "--all", "true"], capture_output=True, text=True, check=True)
    left = alive(result.stdout)

    unexplained = sorted(f"{name}: {verdict}" for name, verdict in left.items() if name not in exemptions)
    stale = sorted(set(exemptions) - set(left))
    if unexplained:
        print("Unexplained mutants - write a test that kills them, or add a reasoned entry to")
        print(f"{EXEMPTIONS_PATH.name}:")
        for line in unexplained:
            print(f"  {line}")
    if stale:
        print(f"{EXEMPTIONS_PATH.name} names mutants that are killed or no longer generated - remove them:")
        for name in stale:
            print(f"  {name}")
    if unexplained or stale:
        return 1

    print(f"No unexplained survivors ({len(exemptions)} exempted mutant(s) all accounted for).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
