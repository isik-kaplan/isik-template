"""What a restored mutation cache must forget before it is trusted.

mutmut never notices a test edited in place (its git check ignores `.py`), so a kill would outlive the
test that earned it. Reads mutmut's files as JSON, not its classes, to survive refactors upstream.

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
# Not inside the stats file: mutmut's `load_stats` rejects unknown keys.
BASELINE = TREE / ".test-hashes.json"
KILLERS = TREE / "mutmut-mutants.jsonl"
CONFIRMED = TREE / "mutmut-confirmed.json"

# Changes mutmut does not act on: its git check drops `.py` and only warns about the rest.
WATCHED = (
    "conftest.py",
    "**/conftest.py",
    "**/tests/**/*.py",
    "**/templates/**/*",
    "locale/**/*",
    # For re-tracing only: nothing re-traces tests reaching a function mutmut has never seen.
    "apps/**/*.py",
    "{{ cookiecutter.project_slug }}/**/*.py",
    "scripts/**/*.py",
)

# Not -24: mutmut's table lists it as a kill and later as a SIGXCPU timeout, and the later entry wins.
KILLS = frozenset({1, 3})
# mutmut resets this itself when the type checker's set changes.
TYPE_CHECKED = 37


def _hash(data):
    return hashlib.sha256(data).hexdigest()[:16]


def _is_test_unit(node):
    """A `Test*` class counts whole: class attributes and fixtures reach every method."""
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return node.name.startswith("test")
    return isinstance(node, ast.ClassDef) and node.name.startswith("Test")


def _hash_test_module(name, source):
    """One hash per test, plus one for the rest of the module (which stales every test in it)."""
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
    current = {}
    for name in _watched_files(root, patterns):
        source = (root / name).read_bytes()
        if _is_test_module(name):
            current.update(_hash_test_module(name, source))
        else:
            current[name] = _hash(source)
    return current


def changed_watched_files(root=ROOT, baseline=BASELINE, patterns=WATCHED):
    """Changed watched files and the new hashes (returned, not written - see `write_baseline`).

    No baseline beside an existing cache means everything changed: those verdicts can't be vouched for.
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
    """Tests reaching this module: re-tracing them finds a new function, cheaper than tracing the suite."""
    prefix = name.removesuffix(".py").replace("/", ".") + "."
    traced = stats.get("tests_by_mangled_function_name", {})
    return {test for function, tests in traced.items() if function.startswith(prefix) for test in tests}


def stale_tests(changed, stats, include_sources=True):
    """Test ids these changes invalidate, or None for everything (not the known set: the map is suspect).

    `include_sources` is off for verdicts: mutmut already clears a changed source function's verdict.
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
    # A conftest owns no test id, so match on its directory.
    stale = set()
    for key in modules:
        path, unit = _path_of(key), key.partition("::")[2]
        in_file = {test for test in known if test.partition("::")[0] == path}
        # No unit: module-level code, which any test in the file can read.
        stale |= {test for test in in_file if _unit_of(test) == unit} if unit else in_file
    scopes = tuple(_path_of(key).rpartition("/")[0] + "/" if "/" in _path_of(key) else "" for key in conftests)
    stale |= {test for test in known if test.startswith(scopes)} if scopes else set()
    for key in sources if include_sources else ():
        stale |= _traced_by_module(_path_of(key), stats)
    return stale


def prune_stats_map(changed, stats_path=STATS):
    """Forget these tests so mutmut re-traces them. Both maps: `load_stats` merges traces with `|=`."""
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
    # `watched_file_hashes` and `git_commit` are mutmut's own baseline; only a full run moves them.
    stats_path.write_text(json.dumps(stats, indent=2, sort_keys=True))
    return dropped


def invalidate_verdicts_for(changed, stats_path=STATS, tree=TREE, record=None):
    """Clear verdicts a changed test could now decide differently.

    A kill is cleared only if its recorded killer changed (else its traced set). Non-kills are always
    cleared: a no-tests mutant has an empty traced set, so matching on traces would keep it forever.
    """
    stats_path, tree = Path(stats_path), Path(tree)
    if not changed or not tree.exists():
        return 0
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
    """Drop phase two's verdicts on any change: keyed by mutation, nothing else ever resets them."""
    report = Path(report)
    if not changed or not report.exists():
        return 0
    dropped = len(json.loads(report.read_text()))
    report.unlink()
    return dropped


def prune_orphaned_tree(source_paths, also_copy, root=ROOT, tree=TREE):
    """Delete copies whose source is gone; only under `source_paths`/`also_copy`, never mutmut's cache."""
    root, tree = Path(root), Path(tree)
    if not tree.exists():
        return 0
    removed = 0
    for entry in [*source_paths, *also_copy]:
        mirror = tree / entry
        # mutmut's copy skips a missing source, so a stale single-file mirror (e.g. conftest.py) lives forever.
        if mirror.is_file():
            if not (root / entry).exists():
                mirror.unlink()
                removed += 1
            continue
        for copy in sorted(mirror.rglob("*")) if mirror.is_dir() else []:
            if not copy.is_file() or "__pycache__" in copy.parts:
                continue
            relative = copy.relative_to(tree)
            # Judge a sidecar by its source, so walk order cannot leave one behind.
            for suffix in (".meta", ".spans"):
                if relative.name.endswith(suffix):
                    relative = relative.with_name(relative.name[: -len(suffix)])
                    break
            if not (root / relative).exists():
                copy.unlink()
                removed += 1
    return removed


def killers(record=KILLERS):
    """The test that earned each kill; last line wins, so a later survival clears the killer."""
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
    """Exit code by mutant name; `None` is a cleared verdict."""
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
    """The whole job, in order. Every path derives from `root` so one tree can't read another's verdicts."""
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
