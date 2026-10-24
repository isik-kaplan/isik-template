"""The fingerprint the mutation cache is keyed on: what mutmut's own change detection is blind to.

Not the commit: restoring an earlier commit's cache is the point, and `mutation_cache.py` makes it safe.

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

# Code that decides, names or keeps verdicts without being mutated: a fix here must drop the cache.
VERDICT_TOOLING = [
    ROOT / "scripts" / "confirm_survivors.py",
    ROOT / "conftest.py",
    ROOT / "scripts" / "mutation_naming.py",
    ROOT / "scripts" / "mutation_cache.py",
    ROOT / "scripts" / "mutation_test_order.py",
]


def fingerprint():
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
