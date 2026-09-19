"""The fingerprint the mutation cache is keyed on.

A cache that should have been discarded reports mutants as settled when nothing re-verified them, so
what goes in is deliberate:

  * the parsed `[tool.mutmut]` table rather than pyproject.toml, which also carries ruff, coverage and
    pytest settings that cannot change a verdict
  * the dependencies and the lockfile, which mutmut's git-based change detection is blind to
  * `confirm_survivors.py` and `conftest.py`, which decide and record verdicts without being source
    files mutmut watches - a bug fixed in either otherwise leaves its false kills cached and terminal

    python scripts/mutation_cache_key.py
"""

import hashlib
import json
import sys
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parent.parent
PYPROJECT = ROOT / "pyproject.toml"
LOCKFILE = ROOT / "uv.lock"

# What a stored verdict means, rather than what was mutated.
VERDICT_TOOLING = [ROOT / "scripts" / "confirm_survivors.py", ROOT / "conftest.py"]


def fingerprint():
    """A stable hash of everything that must invalidate the cached verdicts."""
    config = tomllib.loads(PYPROJECT.read_text())
    mutmut = config.get("tool", {}).get("mutmut", {})

    material = {
        "mutmut": mutmut,
        "dependencies": sorted(config.get("project", {}).get("dependencies", [])),
        "dev_dependencies": sorted(config.get("tool", {}).get("uv", {}).get("dev-dependencies", [])),
        "lockfile": hashlib.sha256(LOCKFILE.read_bytes()).hexdigest() if LOCKFILE.exists() else "",
        "verdict_tooling": {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else ""
            for path in VERDICT_TOOLING
        },
    }
    encoded = json.dumps(material, sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()[:16]


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv:
        print("usage: mutation_cache_key.py", file=sys.stderr)
        return 2
    print(fingerprint())
    return 0


if __name__ == "__main__":
    sys.exit(main())
