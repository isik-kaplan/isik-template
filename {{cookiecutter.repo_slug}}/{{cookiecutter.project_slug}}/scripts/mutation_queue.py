"""The mutants phase one should actually run, and separately the ones it should not.

Two registries name mutants phase one skips, because proving them again costs each its whole traced
test set:

  * `mutation-equivalents.toml` - single mutants no test can kill, keyed by the mutation itself.
  * `mutation-exemptions.toml` - whole functions mutmut's tracing cannot attribute to any test, keyed
    by function, so the entry covers every mutant of it.

    python -m scripts.mutation_queue --run     # names phase one should run
    python -m scripts.mutation_queue --exempt  # names to re-check afterwards

An equivalent entry carrying `verified_by` is left out of `--exempt`: the test it names asserts the
library behavior the reason rests on, in milliseconds on every push, which is a stronger re-check
than running the mutant to observe - again - that nothing killed it.

There is one run rather than a shard's slice of one: nothing here is sharded yet (see the CI workflow
for when that stops being true), so `--run` is every mutant minus the skipped set, not an
intersection with a shard's own scope first.
"""

import fnmatch
import sys
from pathlib import Path

import tomllib

from scripts.mutation_naming import apply as name_mutants_by_change
from scripts.mutation_naming import module_of
from scripts.mutmut_decorators import install as install_mutmut_decorators


ROOT = Path(__file__).resolve().parent.parent
EQUIVALENTS = ROOT / "mutation-equivalents.toml"
EXEMPTIONS = ROOT / "mutation-exemptions.toml"
# Named rather than spelled inline so its case can be asserted: APFS opens `PYPROJECT.TOML` and ext4
# does not, so a re-cased literal is a mutant that lives on this laptop and dies on the runners.
PYPROJECT_NAME = "pyproject.toml"


def _registry(path):
    return tomllib.loads(path.read_text()) if path.exists() else {}


def function_of(name):
    """`module.xǁClassǁmethod__mutmut__1f0c3a9d4e7b` -> `module.xǁClassǁmethod`, the key
    `mutation-exemptions.toml` uses."""
    return name.rpartition("__mutmut_")[0] or name


def skipped(in_tree, equivalents, exemptions):
    """Every mutant of `in_tree` either registry names."""
    return {name for name in in_tree if name in equivalents or function_of(name) in exemptions}


def rechecked(in_tree, equivalents, exemptions):
    """The skipped mutants a re-run is the only re-check for."""
    verified = {name for name, entry in equivalents.items() if entry.get("verified_by")}
    return skipped(in_tree, equivalents, exemptions) - verified


def _in_tree():
    """Every mutant this run holds, generated from the source rather than read from the tree.

    Phase one computes this before mutmut has generated anything, so reading the tree returns an empty
    queue on a cold run - which the caller reads as "everything here is exempt" and mutates nothing.
    The names are generated here, so they have to be generated the way the tree will be: with the
    decorator patch, and named by change. Without either, the queue names mutants the tree never
    holds, mutmut reports them "not checked", and the unsettled list reads that as survived.
    """
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
        # Every entry, whatever re-checks it: running a registered mutant settles nothing.
        wanted = sorted(in_tree - skipped(in_tree, equivalents, exemptions))
    else:
        wanted = sorted(rechecked(in_tree, equivalents, exemptions))
    print("\n".join(wanted))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
