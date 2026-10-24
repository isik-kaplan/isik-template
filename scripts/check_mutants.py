#!/usr/bin/env python3
"""Fails unless the surviving mutants and mutation-exemptions.toml's entries match exactly, both ways."""

import subprocess
import sys
import tomllib
from pathlib import Path


EXEMPTIONS_PATH = Path(__file__).resolve().parent.parent / "mutation-exemptions.toml"
# Anything else ("no tests", "timeout", "suspicious", "not checked") is not a pass.
SETTLED = ("killed", "skipped", "caught by type check")


def alive(results):
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
