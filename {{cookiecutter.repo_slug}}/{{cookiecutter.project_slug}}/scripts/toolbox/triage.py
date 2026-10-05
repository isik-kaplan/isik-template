"""Turn a run's survivor list into the work it implies: netted, grouped by file, worst first.

`unsettled.txt` (`<name>: <verdict>` lines) and `mutants/mutmut-confirmed.json` both list mutants
flat and alphabetically, with the registries not subtracted and nothing saying which file a name
belongs to. This reads either.

    python -m scripts.toolbox.triage mutants/mutmut-confirmed.json
    python -m scripts.toolbox.triage unsettled.txt --diffs
"""

import argparse
import json
import sys
from pathlib import Path

from scripts.toolbox.generated import diff_of, is_registered, registered, source_of


def survivors_in(path):
    """Mutant names from a confirmed report (survivors only) or a `name: verdict` queue file."""
    text = Path(path).read_text()
    if path.endswith(".json"):
        return sorted(name for name, entry in json.loads(text).items() if entry.get("verdict") == "survived")
    return sorted({line.rpartition(": ")[0].strip() or line.strip() for line in text.splitlines() if line.strip()})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("report", help="unsettled.txt or mutants/mutmut-confirmed.json")
    parser.add_argument("--diffs", action="store_true", help="print what each mutant changes")
    options = parser.parse_args(argv)

    single, whole = registered()
    by_file, orphans, exempt = {}, [], 0
    for name in survivors_in(options.report):
        if is_registered(name, single, whole):
            exempt += 1
            continue
        source = source_of(name)
        (by_file.setdefault(source, []) if source else orphans).append(name)

    total = sum(len(names) for names in by_file.values())
    print(f"{total} to decide, {exempt} already registered, across {len(by_file)} files\n")
    for source, names in sorted(by_file.items(), key=lambda item: (-len(item[1]), item[0])):
        print(f"{len(names):4}  {source}")
        if not options.diffs:
            continue
        for name in names:
            print(f"        {name.rpartition('.')[2]}")
            diff = diff_of(name)
            if diff is None:
                print("          !! not generated any more - the source changed since this report")
            for line in diff or []:
                print(f"          {line.rstrip()[:130]}")
    if orphans:
        print(f"\n{len(orphans)} names resolved to no file:")
        for name in orphans:
            print(f"    {name}")
    return 1 if total or orphans else 0


if __name__ == "__main__":
    sys.exit(main())
