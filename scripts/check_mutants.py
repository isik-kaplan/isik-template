#!/usr/bin/env python3
"""Fails if `mutmut run` reported a survivor or an untested mutant whose function isn't listed in
mutation-exemptions.toml. Run this right after `mutmut run` - it just reads `mutmut results`."""

import subprocess
import sys
import tomllib
from pathlib import Path


EXEMPTIONS_PATH = Path(__file__).resolve().parent.parent / "mutation-exemptions.toml"


def mangled_function(mutant_name: str) -> str:
    """`module.xǁClassǁmethod__mutmut_7` -> `module.xǁClassǁmethod` - exemptions are keyed by
    function, not by mutant number, so a new mutant added to an already-exempted function later
    doesn't need its own entry."""
    return mutant_name.rpartition("__mutmut_")[0]


def main() -> int:
    exemptions = tomllib.loads(EXEMPTIONS_PATH.read_text()) if EXEMPTIONS_PATH.exists() else {}
    result = subprocess.run(["mutmut", "results"], capture_output=True, text=True, check=True)

    unexplained = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line.endswith((": survived", ": no tests")):
            continue
        mutant_name = line.rsplit(":", 1)[0].strip()
        if mangled_function(mutant_name) not in exemptions:
            unexplained.append(line)

    if unexplained:
        print("Unexplained mutants - write a test that kills them, or add a reasoned entry to")
        print(f"{EXEMPTIONS_PATH.name}:")
        for line in unexplained:
            print(f"  {line}")
        return 1

    print(f"No unexplained survivors ({len(exemptions)} exempted function(s) all accounted for).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
