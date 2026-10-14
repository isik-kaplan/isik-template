"""What a restored mutation cache must forget before it is trusted.

mutmut clears a verdict when the mutated function's hash changes, and re-traces a test it has not
seen before. Neither sees a test that was edited in place: the per-function hashes cover only files
it mutates, and its git check drops `.py` outright on the grounds that those hashes already cover
them. So a kill outlives the test that earned it, and a function covered only by an edited test is
reported as having no tests at all - which reads exactly like a survivor.

A changed file is one of three things, and only the first maps onto test ids:

  * a test module, which invalidates the tests it holds
  * a `conftest.py`, which invalidates every test under its directory - it owns no test id of its
    own, so matching on ids would quietly invalidate nothing at all
  * anything else the suite reads - a factory, a helper, a template, a catalog - which invalidates
    everything, because nothing maps it to a test

Everything here works on mutmut's own files as JSON rather than through its classes, so a version
that moves a function does not move this.

Two steps, because they belong on either side of the tree being built. `prune` drops copies whose
source is gone and must run first, since mutmut never refreshes a copy it already has. `invalidate`
reads the verdicts mutmut has just re-keyed to the current source, so it must run after.

    python -m scripts.mutation_cache prune        # before the tree is built
    python -m scripts.mutation_cache invalidate   # after it, before the queue is built
"""

import ast
import hashlib
import json
import sys
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parent.parent
TREE = ROOT / "mutants"
STATS = TREE / "mutmut-stats.json"
# Its own file: `load_stats` asserts the map holds no key it does not know, so a baseline kept in
# there would crash the load rather than be ignored.
BASELINE = TREE / ".test-hashes.json"
# Written by `scripts/mutation_test_order.py`, one line per mutant run, naming the test that failed.
KILLERS = TREE / "mutmut-mutants.jsonl"
# Phase two's verdicts, keyed by mutant name alone - see `forget_confirmed`.
CONFIRMED = TREE / "mutmut-confirmed.json"

# Watched because a verdict can depend on them while nothing else notices they moved. The `.py` ones
# are invisible to mutmut's git check, which drops Python; the rest reach it only as a warning.
WATCHED = (
    "conftest.py",
    "**/conftest.py",
    "**/tests/**/*.py",
    "**/templates/**/*",
    "locale/**/*",
    # Watched for their traces rather than their verdicts: mutmut re-keys a changed function's
    # verdict itself, but nothing re-traces the tests that reach a function it has never seen.
    "apps/**/*.py",
    "{{ cookiecutter.project_slug }}/**/*.py",
    "scripts/**/*.py",
)

# A verdict the tests decided. Everything else a run can record - survived, no tests, timed out,
# interrupted - is a non-answer that a new or edited test could change.
#
# Not -24, which mutmut's own table lists as a kill at one line and as a SIGXCPU timeout twelve
# lines later; the second wins, and reading only the first would protect a mutant that hung as
# though a test had caught it.
KILLS = frozenset({1, 3})
# mutmut resets this one itself when the type checker's own set changes, so it is not ours to clear.
TYPE_CHECKED = 37


def _hash(data):
    return hashlib.sha256(data).hexdigest()[:16]


def _is_test_unit(node):
    """A top-level test, which is the unit a change can be isolated to.

    A `Test*` class counts whole rather than per method, deliberately: class attributes and
    class-scoped fixtures mean a method's behavior is not contained in the method.
    """
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return node.name.startswith("test")
    return isinstance(node, ast.ClassDef) and node.name.startswith("Test")


def _hash_test_module(name, source):
    """One hash per test in the file, plus one for everything else in it.

    Everything else is imports, helpers, fixtures and parametrize constants - a change there can
    reach any test in the file, so it stales all of them. `ast.dump` carries decorators and drops
    comments and formatting, so a reformat or a comment invalidates nothing.
    """
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return {name: _hash(source)}
    hashes, rest = {}, []
    for node in tree.body:
        if _is_test_unit(node):
            hashes[f"{name}::{node.name}"] = _hash(ast.dump(node).encode())
        else:
            rest.append(node)
    hashes[name] = _hash(ast.dump(ast.Module(body=rest, type_ignores=[])).encode())
    return hashes


def _path_of(key):
    return key.partition("::")[0]


def _unit_of(test_id):
    """The test or class a pytest node id belongs to, without its parameters."""
    return test_id.partition("::")[2].partition("::")[0].partition("[")[0]


def _watched_files(root, patterns):
    found = set()
    for pattern in patterns:
        for path in root.glob(pattern):
            if path.is_file():
                name = path.relative_to(root).as_posix()
                if not name.startswith("mutants/"):
                    found.add(name)
    return found


def _hashes(root, patterns):
    """Every watched file, test modules split into the tests they hold."""
    current = {}
    for name in _watched_files(root, patterns):
        source = (root / name).read_bytes()
        if _is_test_module(name):
            current.update(_hash_test_module(name, source))
        else:
            current[name] = _hash(source)
    return current


def changed_watched_files(root=ROOT, baseline=BASELINE, patterns=WATCHED):
    """Watched files whose content no longer matches the baseline, and the hashes that replace it.

    With no baseline but a cache already on disk, every file counts as changed: those verdicts came
    from somewhere this cannot vouch for, and trusting them is the one failure that is silent.

    The baseline is returned rather than written, because it may only be stamped once the work it
    describes has actually happened - see `write_baseline`.
    """
    root, baseline = Path(root), Path(baseline)
    current = _hashes(root, patterns)
    if baseline.exists():
        stored = json.loads(baseline.read_text())
        changed = {name for name, digest in current.items() if stored.get(name) != digest}
        changed |= set(stored) - set(current)
    elif (root / "mutants" / "mutmut-stats.json").exists():
        changed = set(current)
    else:
        changed = set()
    return changed, current


def write_baseline(current, baseline=BASELINE):
    """Stamped last, so a run that dies half way through leaves the next one still distrustful."""
    baseline = Path(baseline)
    baseline.parent.mkdir(parents=True, exist_ok=True)
    baseline.write_text(json.dumps(current, indent=2, sort_keys=True))


def _is_test_module(name):
    base = name.rpartition("/")[2]
    return base.startswith("test_") or base.endswith("_test.py")


def _traced_by_module(name, stats):
    """The tests the map says reach anything in this source module.

    A changed module can hold a function the map has never seen, and a function the map has never
    seen traces no tests at all - so its mutants are recorded as untested, which reads as a
    survivor. Re-tracing the tests that already reach this module is what discovers it, and is a
    great deal cheaper than tracing the suite again.
    """
    prefix = name.removesuffix(".py").replace("/", ".") + "."
    traced = stats.get("tests_by_mangled_function_name", {})
    return {test for function, tests in traced.items() if function.startswith(prefix) for test in tests}


def stale_tests(changed, stats, include_sources=True):
    """The test ids these changes invalidate, or None when they invalidate everything.

    None rather than the full set, because "all of them" and "all the ones we happen to know about"
    are different answers once the map itself is suspect.

    `include_sources` is off when the caller is clearing verdicts rather than traces. A changed
    source function already has its verdict cleared by mutmut, against the hash it recorded for it,
    and a function too new to have one has no verdict to clear - so re-tracing is all a source edit
    needs, and clearing on top of it would throw away kills nothing has questioned.
    """
    modules = {key for key in changed if _is_test_module(_path_of(key))}
    conftests = {key for key in changed if _path_of(key).rpartition("/")[2] == "conftest.py"}
    sources = {
        key
        for key in changed - modules - conftests
        if _path_of(key).endswith(".py") and "/tests/" not in _path_of(key) and not _path_of(key).startswith("tests/")
    }
    if changed - modules - conftests - sources:
        return None
    known = set(stats.get("duration_by_test", {}))
    for names in stats.get("tests_by_mangled_function_name", {}).values():
        known |= set(names)
    # A conftest owns no test id, so it is matched on the directory it governs instead.
    stale = set()
    for key in modules:
        path, unit = _path_of(key), key.partition("::")[2]
        in_file = {test for test in known if test.partition("::")[0] == path}
        # No unit means the rest of the module - imports, fixtures, helpers - which any test in the
        # file can be reading.
        stale |= {test for test in in_file if _unit_of(test) == unit} if unit else in_file
    scopes = tuple(_path_of(key).rpartition("/")[0] + "/" if "/" in _path_of(key) else "" for key in conftests)
    stale |= {test for test in known if test.startswith(scopes)} if scopes else set()
    for key in sources if include_sources else ():
        stale |= _traced_by_module(_path_of(key), stats)
    return stale


def prune_stats_map(changed, stats_path=STATS):
    """Forget these tests so mutmut's own `new_tests()` traces them again.

    Both structures, not just the durations: `load_stats` merges the traced sets with `|=`, so a
    re-trace only ever adds edges and an old one left behind is never overwritten.
    """
    stats_path = Path(stats_path)
    if not changed or not stats_path.exists():
        return 0
    stats = json.loads(stats_path.read_text())
    stale = stale_tests(changed, stats)
    traced = stats.get("tests_by_mangled_function_name", {})
    if stale is None:
        dropped = len(stats.get("duration_by_test", {}))
        stats["duration_by_test"] = {}
        stats["tests_by_mangled_function_name"] = {key: [] for key in traced}
    elif stale:
        dropped = len(stale)
        stats["duration_by_test"] = {k: v for k, v in stats.get("duration_by_test", {}).items() if k not in stale}
        stats["tests_by_mangled_function_name"] = {k: sorted(set(v) - stale) for k, v in traced.items()}
    else:
        return 0
    # `watched_file_hashes` and `git_commit` are left exactly as found: they are mutmut's own
    # change-detection baseline, and only a full run is entitled to move them.
    stats_path.write_text(json.dumps(stats, indent=2, sort_keys=True))
    return dropped


def invalidate_verdicts_for(changed, stats_path=STATS, tree=TREE, record=None):
    """Clear the stored verdict of every mutant a changed test could now decide differently.

    A kill is cleared when the test that earned it changed. That is the test mutmut's `-x` run left
    failing, which `scripts/mutation_test_order.py` writes down - not the whole traced set, which for
    anything central is most of the suite and would put the shard back on the queue for one edit.
    A kill with no recorded killer falls back to the traced set, which is the old rule.

    Everything that is not a kill is cleared whatever its traces say, because the traces are exactly
    what is wrong with it: a mutant recorded as having no tests has an empty traced set, so matching
    on traces would keep that verdict forever and writing the test would never register. Re-running
    these is cheap - one that still has no tests is re-recorded without running anything.
    """
    stats_path, tree = Path(stats_path), Path(tree)
    if not changed or not tree.exists():
        return 0
    # No map to match kills against, so nothing here can be vouched for.
    stale = None
    if stats_path.exists():
        stats = json.loads(stats_path.read_text())
        stale = stale_tests(changed, stats, include_sources=False)
    if stale is None:
        touched = None
    else:
        touched = {
            function
            for function, tests in stats.get("tests_by_mangled_function_name", {}).items()
            if stale & set(tests)
        }
    pinned = killers(tree / KILLERS.name if record is None else record)
    cleared = 0
    for meta_path in sorted(tree.rglob("*.py.meta")):
        meta = json.loads(meta_path.read_text())
        verdicts = meta.get("exit_code_by_key", {})
        dirty = False
        for key, code in list(verdicts.items()):
            if code is None or code == TYPE_CHECKED:
                continue
            if touched is None or code not in KILLS:
                stale_verdict = True
            elif pinned.get(key) is not None:
                stale_verdict = pinned[key] in stale
            else:
                stale_verdict = key.partition("__mutmut_")[0] in touched
            if stale_verdict:
                verdicts[key] = None
                cleared += 1
                dirty = True
        if dirty:
            meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True))
    return cleared


def forget_confirmed(changed, report=CONFIRMED):
    """Drop phase two's verdicts whole once anything watched has changed.

    They are filed by mutant name, and a name is the mutation rather than the function around it, so
    neither mutmut's re-keying nor the reset above ever reaches them: a kill phase two recorded on an
    earlier commit would be read back as this one's. Each was decided against the whole suite, so no
    narrower rule than "anything changed" can vouch for one, and phase two only ever holds the few
    phase one left alive, so re-deciding them is cheap.
    """
    report = Path(report)
    if not changed or not report.exists():
        return 0
    dropped = len(json.loads(report.read_text()))
    report.unlink()
    return dropped


def prune_orphaned_tree(source_paths, also_copy, root=ROOT, tree=TREE):
    """Delete copies whose source is gone, so a rename cannot leave two of a file behind.

    Only files mirroring something under `source_paths` or `also_copy` are even considered -
    everything else down there is mutmut's own bookkeeping, and the cache this exists to protect
    would be the first thing a wider sweep deleted.
    """
    root, tree = Path(root), Path(tree)
    if not tree.exists():
        return 0
    removed = 0
    for entry in [*source_paths, *also_copy]:
        mirror = tree / entry
        # A file entry has no subtree to orphan, and mutmut's copy skips a source that is gone -
        # so without this its stale mirror would live forever. `conftest.py` is one of these.
        if mirror.is_file():
            if not (root / entry).exists():
                mirror.unlink()
                removed += 1
            continue
        for copy in sorted(mirror.rglob("*")) if mirror.is_dir() else []:
            if not copy.is_file() or "__pycache__" in copy.parts:
                continue
            relative = copy.relative_to(tree)
            # A sidecar is judged against its own source rather than against its module, so walk
            # order cannot leave one behind.
            for suffix in (".meta", ".spans"):
                if relative.name.endswith(suffix):
                    relative = relative.with_name(relative.name[: -len(suffix)])
                    break
            if not (root / relative).exists():
                copy.unlink()
                removed += 1
    return removed


def killers(record=KILLERS):
    """The test that earned each kill, as `scripts/mutation_test_order.py` recorded it.

    Last line wins, so a mutant that was killed once and survives now reads as having no killer
    rather than keeping the old one.
    """
    record = Path(record)
    found = {}
    if not record.exists():
        return found
    for line in record.read_text().splitlines():
        if line.strip():
            entry = json.loads(line)
            found[entry["mutant"]] = entry.get("killer")
    return found


def verdicts(tree=TREE):
    """Every mutant the tree holds an answer for, mapped to its exit code.

    `None` is in here as much as a number is - it is what a cleared verdict looks like, and the
    queue is built by asking which of these are not yet decided.
    """
    tree = Path(tree)
    found = {}
    if not tree.exists():
        return found
    for meta_path in sorted(tree.rglob("*.py.meta")):
        found.update(json.loads(meta_path.read_text()).get("exit_code_by_key", {}))
    return found


def _copied_paths(root=ROOT):
    config = tomllib.loads((Path(root) / "pyproject.toml").read_text())["tool"]["mutmut"]
    return config.get("source_paths", []), config.get("also_copy", [])


def invalidate_changed_tests(root=ROOT, patterns=WATCHED, baseline=None):
    """The whole job, in the order the steps have to happen.

    Every path is taken from `root` rather than defaulted, so asking about one tree cannot end up
    reading the verdicts of another.
    """
    root = Path(root)
    tree = root / "mutants"
    stats_path = tree / "mutmut-stats.json"
    baseline = tree / ".test-hashes.json" if baseline is None else baseline
    changed, current = changed_watched_files(root=root, baseline=baseline, patterns=patterns)
    result = {
        "changed": sorted(changed),
        "verdicts": invalidate_verdicts_for(changed, stats_path, tree),
        "traces": prune_stats_map(changed, stats_path),
        "confirmed": forget_confirmed(changed, tree / CONFIRMED.name),
    }
    write_baseline(current, baseline)
    return result


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in ("prune", "invalidate"):
        print(__doc__)
        return 2
    if argv[0] == "prune":
        removed = prune_orphaned_tree(*_copied_paths())
        print(f"{removed} orphaned file(s) removed from the tree")
        return 0
    result = invalidate_changed_tests()
    print(f"{len(result['changed'])} watched file(s) changed")
    print(f"{result['verdicts']} verdict(s) cleared, {result['traces']} trace(s) dropped")
    print(f"{result['confirmed']} phase two verdict(s) forgotten")
    return 0


if __name__ == "__main__":
    sys.exit(main())
