"""Whether every registry key still names something mutmut generates.

An entry for a mutant that no longer exists excuses nothing and reads as though it did. The pipeline
only notices one inside a tree that would hold it; this answers for the whole codebase, from the
source, in seconds.

    python -m scripts.toolbox.check_exemption_keys
"""

import sys

from scripts.mutation_queue import EQUIVALENTS, EXEMPTIONS, function_of
from scripts.toolbox.generated import names_in, registered, source_of


def missing_keys():
    """(registry file name, key, why) per key nothing generates."""
    single, whole = registered()
    missing = []
    for registry, keys, single_mutant in ((EQUIVALENTS, single, True), (EXEMPTIONS, whole, False)):
        for key in sorted(keys):
            source = source_of(key)
            if source is None:
                missing.append((registry.name, key, "no source file answers to it"))
                continue
            generated = names_in(source)
            found = key in generated if single_mutant else any(function_of(name) == key for name in generated)
            if not found:
                missing.append((registry.name, key, f"{source} generates no such mutant"))
    return missing


def main():
    missing = missing_keys()
    for registry, key, why in missing:
        print(f"{registry}: {key} - {why}")
    if missing:
        return 1
    print("every registry key names a mutant that is still generated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
