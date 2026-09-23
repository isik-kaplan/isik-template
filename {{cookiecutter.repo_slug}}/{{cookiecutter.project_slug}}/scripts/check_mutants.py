"""Fail the build unless every mutant is accounted for.

`mutmut run` exits 0 whether mutants survived or not, so the policy is enforced here. Two separate
things: the guards, because a tree built for another layout or a suite that failed to collect produces
numbers indistinguishable from a clean pass; and the policy, which only `confirm_survivors.py` can
answer, since phase one under-selects.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STATS = ROOT / "mutants" / "mutmut-cicd-stats.json"
DEFAULT_TREE = ROOT / "mutants"
DEFAULT_PYPROJECT = ROOT / "pyproject.toml"

# A mutant nothing reliably killed: `suspicious` and `timeout` were given up on, not objected to.
# `skipped` is the one benign bucket.
ALIVE = ("survived", "suspicious", "timeout", "no_tests", "segfault")
BUCKETS = ("total", "killed", "skipped", *ALIVE)


def alive_in(stats):
    return sum(stats.get(key, 0) for key in ALIVE)


def mutated_files(tree=DEFAULT_TREE):
    """The files mutmut actually produced results for, read from the `.meta` it writes beside each.

    The exported stats are totals and cannot say which files they came from, which is the whole
    question here.
    """
    tree = Path(tree)
    return {str(path.relative_to(tree))[: -len(".meta")] for path in tree.rglob("*.py.meta")}


def scoped_files(pyproject=DEFAULT_PYPROJECT):
    """The files a future `only_mutate` would claim, or None when nothing is scoped.

    Nothing sets `only_mutate` yet - see the mutation CI job for when introducing it (sharding) starts
    paying for itself - but the check stays generic rather than assuming a single, unscoped run forever.
    """
    return tomllib.loads(Path(pyproject).read_text())["tool"]["mutmut"].get("only_mutate")


def tree_problems(tree=DEFAULT_TREE, pyproject=DEFAULT_PYPROJECT):
    """Whether the results on disk belong to the code being reported on.

    mutmut builds `mutants/` once and neither adds scaffolding for a newly included file nor removes a
    deleted one, so a stale tree answers with a previous run's numbers and nothing in the totals shows
    it. `rm -rf mutants` between runs avoids this; this checks that it happened.
    """
    tree = Path(tree)
    if not tree.exists():
        return []

    problems = []
    mutated = mutated_files(tree)
    # Existence is resolved against the pyproject's own directory rather than this file's, so the tree,
    # the scope and the source being compared are always the same checkout.
    source_root = Path(pyproject).resolve().parent
    # Every file copied in, not only the ones with results: a stale migration fails the run as a clash
    # between two initials, reported as "failed to collect stats".
    copied = {str(path.relative_to(tree)) for path in tree.rglob("*.py")}
    gone = sorted(path for path in mutated | copied if not (source_root / path).exists())
    if gone:
        problems.append(
            "the mutants/ tree holds file(s) that no longer exist: "
            + ", ".join(gone)
            + " - it was built against an older layout. `rm -rf mutants` and run again."
        )

    scope = scoped_files(pyproject)
    if scope is None:
        return problems

    untested = sorted(set(scope) - mutated)
    if untested:
        problems.append(
            "the scope claims file(s) mutmut produced no results for: "
            + ", ".join(untested)
            + " - mutmut does not add mutants to an existing tree, so these were never mutated."
            " `rm -rf mutants` and run again."
        )
    foreign = sorted(mutated - set(scope))
    if foreign:
        problems.append(
            "results are present for file(s) outside the scope: "
            + ", ".join(foreign)
            + " - so the numbers are from a different configuration. `rm -rf mutants` and run again."
        )
    return problems


def unrun(stats):
    """Whether a run produced mutants but a verdict for none of them.

    "Nothing survived" and "nothing ran" are identical in every bucket. Seen twice: a suite that failed
    to collect inside `mutants/`, and an edit to `[tool.mutmut]` that invalidated every stored verdict.
    """
    accounted = stats.get("killed", 0) + stats.get("skipped", 0) + alive_in(stats)
    return bool(stats.get("total", 0)) and not accounted


def killed_by_one_test(path):
    """Whether one test killed every mutant here, which no working suite does.

    A tree that fails on import fails every mutant, each failure is recorded as a kill, and the run
    reports a clean sweep. A count alone cannot tell the two apart - but one test doing all of it can
    only be the tree.
    """
    path = Path(path)
    if not path.exists():
        return None
    killers = Counter()
    for line in path.read_text().splitlines():
        killer = json.loads(line).get("killer") if line.strip() else None
        if killer:
            killers[killer] += 1
    total = sum(killers.values())
    if len(killers) != 1 or total < 2:
        return None
    return (
        f"all {total:,} kills came from one test, so this is a tree that fails whatever it is asked, "
        f"not a suite: {next(iter(killers))}"
    )


def confirmed(path):
    """`confirm_survivors.py`'s report: mutant name -> verdict, or None when it has not run.

    `error` counts as unsettled rather than as a kill. A mutant that takes the fixtures down with it
    does produce a failing suite, but so does a broken database, and the two are not distinguishable
    from a return code.
    """
    path = Path(path)
    if not path.exists():
        return None
    return {name: entry["verdict"] for name, entry in json.loads(path.read_text()).items()}


def cost_of(stats_path, names):
    """What each surviving mutant costs, from the map the stats step already built.

    Only a survivor pays for its whole traced set - measured at dozens of times an ordinary mutant in
    a suite this size, enough to visibly extend a run on its own.
    """
    path = Path(stats_path)
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    tests, durations = data["tests_by_mangled_function_name"], data["duration_by_test"]
    suite = sum(durations.values()) or 1.0
    priced = {}
    for name in names:
        function = name.rpartition("__mutmut_")[0] or name
        seconds = sum(durations.get(test, 0.0) for test in tests.get(function, ()))
        priced[name] = (seconds, seconds / suite * 100)
    return priced


def exempt(path, names):
    """Which of `names` belongs to a function `mutation-exemptions.toml` records as unkillable.

    The file is keyed by function, covering every mutant of it, so a mutant name is never a key in
    it directly - only matched against one after its own mutant number is stripped.
    """
    path = Path(path)
    if not path.exists():
        return set()
    functions = set(tomllib.loads(path.read_text()))
    return {name for name in names if (name.rpartition("__mutmut_")[0] or name) in functions}


def read(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as error:
        return {"unreadable": str(error)}


def table(rows):
    """One line per row plus a total. Widest column wins; no dependencies."""
    columns = ["run", *BUCKETS]
    widths = {name: len(name) for name in columns}
    for label, stats in rows:
        widths["run"] = max(widths["run"], len(label))
        for name in BUCKETS:
            widths[name] = max(widths[name], len(f"{stats.get(name, 0):,}"))

    header = "  ".join(name.rjust(widths[name]) for name in columns)
    lines = [header.replace("run".rjust(widths["run"]), "run".ljust(widths["run"]), 1)]
    lines.append("-" * len(lines[0]))
    for label, stats in rows:
        cells = [label.ljust(widths["run"])]
        cells += [f"{stats.get(name, 0):,}".rjust(widths[name]) for name in BUCKETS]
        lines.append("  ".join(cells))
    if len(rows) > 1:
        totals = {name: sum(stats.get(name, 0) for _, stats in rows) for name in BUCKETS}
        lines.append("-" * len(lines[0]))
        cells = ["TOTAL".ljust(widths["run"])]
        cells += [f"{totals[name]:,}".rjust(widths[name]) for name in BUCKETS]
        lines.append("  ".join(cells))
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", help="stats files, or directories to search for them")
    parser.add_argument("--label", help="name for a single file's row")
    parser.add_argument("--summary", help="also append the table here (GITHUB_STEP_SUMMARY)")
    parser.add_argument(
        "--phase-one",
        action="store_true",
        help="report mutants left alive without failing on them - phase two settles those."
        " The false-green guards still apply.",
    )
    parser.add_argument("--tree", default=DEFAULT_TREE, help="the tree the results must belong to")
    parser.add_argument("--stats", default="mutants/mutmut-stats.json", help="the map, for pricing what survived")
    parser.add_argument(
        "--kills", default="mutants/mutmut-mutants.jsonl", help="the per-mutant log, for judging what did the killing"
    )
    parser.add_argument("--confirmed", help="confirm_survivors.py's report, which is the verdict")
    parser.add_argument(
        "--queue", help="the queue that report must cover, so a mutant it never ran cannot pass as absent"
    )
    parser.add_argument(
        "--exemptions",
        default=str(ROOT / "mutation-exemptions.toml"),
        help="the mutants phase two skips, which are absent from its report by design",
    )
    options = parser.parse_args(argv)

    found = [(options.label or Path(path).stem, path) for path in (options.paths or [DEFAULT_STATS])]

    # Before reading a single number: are these results for this code? See tree_problems.
    rows, problems = [], tree_problems(options.tree)
    for label, path in found:
        if not Path(path).exists():
            problems.append(f"{path} not found - did `mutmut run` and `mutmut export-cicd-stats` run?")
            continue
        stats = read(path)
        if "unreadable" in stats:
            problems.append(f"{path} could not be read: {stats['unreadable']}")
            continue
        rows.append((label, stats))

    one_test = killed_by_one_test(options.kills)
    if one_test:
        problems.append(one_test)

    for label, stats in rows:
        if stats.get("check_was_interrupted_by_user"):
            problems.append(f"{label}: the run was interrupted, so the results are incomplete")
        if unrun(stats):
            problems.append(
                f"{label}: none of the {stats['total']:,} mutants have a verdict - nothing was tested."
                " Check that the suite collects inside mutants/ before trusting these numbers."
            )

    rendered = table(rows) if rows else "(no results)"
    print(rendered)
    if options.summary:
        with open(options.summary, "a", encoding="utf-8") as handle:
            handle.write(f"\n## Mutation\n\n```\n{rendered}\n```\n")

    if problems:
        print("\n" + "\n".join(problems))
        return 1

    total_alive = sum(alive_in(stats) for _, stats in rows)
    if options.phase_one:
        print(f"\n{total_alive:,} mutant(s) for phase two to settle")
        return 0

    verdicts = confirmed(options.confirmed) if options.confirmed else None
    if verdicts is None:
        if total_alive:
            print(f"\n{total_alive:,} mutant(s) still alive, and no phase-two report to settle them.")
            return 1
        print("\nno surviving mutants")
        return 0

    # A mutant phase two never reached is absent rather than unsettled, so without the queue a report
    # holding one verdict reads like a complete one.
    if options.queue:
        queued = {
            line.rpartition(": ")[0].strip() or line.strip()
            for line in Path(options.queue).read_text().splitlines()
            if line.strip()
        }
        # An exempt mutant is absent for the one reason that is not a hole; confirm_survivors guards the rest.
        missing = sorted(queued - set(verdicts) - exempt(options.exemptions, queued))
        if missing:
            print(f"\n{len(missing):,} of {len(queued):,} queued mutant(s) have no verdict at all:")
            for name in missing[:20]:
                print(f"  {name}")
            return 1

    survivors = sorted(name for name, verdict in verdicts.items() if verdict == "survived")
    unsettled = sorted(name for name, verdict in verdicts.items() if verdict not in ("killed", "survived"))
    if unsettled:
        print(f"\n{len(unsettled):,} mutant(s) reached no verdict in phase two:")
        for name in unsettled[:20]:
            print(f"  {verdicts[name]:9} {name}")
        return 1
    if survivors:
        priced = cost_of(options.stats, survivors)
        print(f"\n{len(survivors):,} mutant(s) survived the whole suite:")
        for name in sorted(survivors, key=lambda n: -priced.get(n, (0, 0))[0]):
            seconds, share = priced.get(name, (0.0, 0.0))
            print(f"  {seconds / 60:5.1f}m of the suite ({share:4.1f}%)  {name}" if seconds else f"  {name}")
        billed = sum(seconds for seconds, _ in priced.values())
        if billed:
            print(f"\n  these survivors are what the run spent {billed / 60:.0f} traced minutes on")
        print(
            "\nEither add a test that kills it, or record it in mutation-exemptions.toml with a reason"
            " for why no test can."
        )
        return 1

    print(f"\nno surviving mutants ({len(verdicts):,} confirmed against the whole suite)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
