"""The mutants phase one should run, and the registered ones (equivalents, exemptions) it skips.

    python -m scripts.mutation_queue --run     # names phase one should run, less what is answered
    python -m scripts.mutation_queue --exempt  # names to re-check afterwards

`--exempt` omits entries with `verified_by`: their test re-checks them more cheaply.
"""

import fnmatch
import sys
from pathlib import Path

import tomllib

from scripts.mutation_cache import verdicts
from scripts.mutation_naming import apply as name_mutants_by_change
from scripts.mutation_naming import module_of
from scripts.mutmut_decorators import install as install_mutmut_decorators


ROOT = Path(__file__).resolve().parent.parent
EQUIVALENTS = ROOT / "mutation-equivalents.toml"
EXEMPTIONS = ROOT / "mutation-exemptions.toml"
# A constant so its case can be tested: APFS is case-insensitive, so a re-cased mutant survives on macOS.
PYPROJECT_NAME = "pyproject.toml"


def _registry(path):
    return tomllib.loads(path.read_text()) if path.exists() else {}


def function_of(name):
    """`module.xǁClassǁmethod__mutmut__1f0c3a9d4e7b` -> `module.xǁClassǁmethod`."""
    return name.rpartition("__mutmut_")[0] or name


def skipped(in_tree, equivalents, exemptions):
    return {name for name in in_tree if name in equivalents or function_of(name) in exemptions}


def to_run(in_tree, equivalents, exemptions, answers):
    """Unregistered, unanswered mutants. mutmut stops reusing answers once any names are passed, so we filter."""
    answered = {name for name, code in answers.items() if code is not None}
    return in_tree - skipped(in_tree, equivalents, exemptions) - answered


def rechecked(in_tree, equivalents, exemptions):
    verified = {name for name, entry in equivalents.items() if entry.get("verified_by")}
    return skipped(in_tree, equivalents, exemptions) - verified


def _in_tree():
    """Generated from source, not read from the tree (empty on a cold run), with the same patches the tree uses."""
    from mutmut.__main__ import mutate_file_contents

    install_mutmut_decorators()
    name_mutants_by_change()
    config = tomllib.loads((ROOT / PYPROJECT_NAME).read_text())["tool"]["mutmut"]
    do_not_mutate = config.get("do_not_mutate", [])
    only_mutate = config.get("only_mutate", [])

    names = set()
    for source_path in config["source_paths"]:
        for path in sorted((ROOT / source_path).rglob("*.py")):
            relative = str(path.relative_to(ROOT))
            if any(fnmatch.fnmatch(relative, pattern) for pattern in do_not_mutate):
                continue
            if only_mutate and not any(fnmatch.fnmatch(relative, pattern) for pattern in only_mutate):
                continue
            mutated = mutate_file_contents(relative, path.read_text())
            names.update(f"{module_of(relative)}.{name}" for name in mutated.mutant_names)
    return names


def main(argv):
    if len(argv) != 1 or argv[0] not in ("--run", "--exempt"):
        print(__doc__)
        return 2
    in_tree = _in_tree()
    equivalents, exemptions = _registry(EQUIVALENTS), _registry(EXEMPTIONS)
    if argv[0] == "--run":
        wanted = sorted(to_run(in_tree, equivalents, exemptions, verdicts()))
    else:
        wanted = sorted(rechecked(in_tree, equivalents, exemptions))
    # No bare newline: the workflow tests the file for emptiness.
    if wanted:
        print("\n".join(wanted))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
