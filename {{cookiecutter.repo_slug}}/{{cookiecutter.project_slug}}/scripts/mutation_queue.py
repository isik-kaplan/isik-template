"""The mutants phase one should actually run, and separately the ones it should not.

Everything in `mutation-exemptions.toml` is a mutant a real test cannot kill (already verified by
hand - see the file's header) or a mutmut tooling gap, and proving that again costs its whole traced
test set. They are skipped here and re-checked by a step that blocks nothing.

    python -m scripts.mutation_queue --run     # names phase one should run
    python -m scripts.mutation_queue --exempt  # names to re-check afterwards

There is one run rather than a shard's slice of one: nothing here is sharded yet (see the CI workflow
for when that stops being true), so unlike the shard this was ported from, `--run` is every mutant
minus the exempt set, not an intersection with a shard's own scope first.
"""

import fnmatch
import sys
from pathlib import Path

import tomllib

from scripts.mutation_fingerprint import mangled_function


ROOT = Path(__file__).resolve().parent.parent
EXEMPTIONS = ROOT / "mutation-exemptions.toml"
# Named rather than spelled inline so its case can be asserted: APFS opens `PYPROJECT.TOML` and ext4
# does not, so a re-cased literal is a mutant that lives on this laptop and dies on the runners.
PYPROJECT_NAME = "pyproject.toml"


def _exempt(in_tree):
    """Every mutant of `in_tree` whose function is named in `mutation-exemptions.toml`.

    The file is keyed by function so one entry covers every mutant of it, so a mutant name is
    matched against the registry by its function, not compared to the file's keys directly.
    """
    if not EXEMPTIONS.exists():
        return set()
    functions = set(tomllib.loads(EXEMPTIONS.read_text()))
    return {name for name in in_tree if mangled_function(name) in functions}


def _in_tree():
    """Every mutant this run holds, generated from the source rather than read from the tree.

    Phase one computes this before mutmut has generated anything, so reading the tree returns an empty
    queue on a cold run - which the caller reads as "everything here is exempt" and mutates nothing.
    """
    from mutmut.__main__ import mutate_file_contents

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
            module = relative.removesuffix(".py").replace("/", ".")
            mutated = mutate_file_contents(relative, path.read_text())
            names.update(f"{module}.{name}" for name in mutated.mutant_names)
    return names


def main(argv):
    if len(argv) != 1 or argv[0] not in ("--run", "--exempt"):
        print(__doc__)
        return 2
    in_tree = _in_tree()
    exempt = _exempt(in_tree)
    wanted = sorted(in_tree & exempt) if argv[0] == "--exempt" else sorted(in_tree - exempt)
    print("\n".join(wanted))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
