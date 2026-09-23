"""`mutmut run`, with the clean pass replaced by a check of the tree it would have proven.

Before mutating, mutmut runs every traced test unmutated and refuses to continue unless they pass.
It is guarding one thing: that a failure later is the mutant's fault rather than a tree that was
never sound - a broken tree fails every mutant, which is recorded as a kill, so the run reports a
clean sweep having tested nothing.

That guard is worth keeping and is far cheaper than a test run. mutmut copies files it does not
mutate byte for byte, so a hash against the source proves the copy arrived intact, and the mutated
ones only have to parse and carry a trampoline.

What hashing cannot see is a test that passes in the source and fails inside a rewritten tree. That
is a property of the commit rather than of this run, so one clean pass elsewhere covers every one -
see the mutation CI job's own step for it. mutmut's forced-fail check still runs here, which is what
proves this tree's trampolines can fail at all.

    python scripts/mutation_run.py <mutant name> ...
    python scripts/mutation_run.py --build-tree     # for the step that runs the suite in it

Run by path, not `-m scripts.mutation_run`: a regular package's `__path__` is fixed at first import,
so launching this as a module binds `scripts` to whatever tree that import resolved against, in
every child mutmut forks from it. `scripts/` is copied rather than mutated here (see also_copy in
pyproject.toml), so the two trees' copies never disagree - but a future change adding it to
source_paths would make that disagreement real, and silent everywhere except a run that mutates
`scripts/` itself.
"""

import ast
import hashlib
import os
import sys
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parent.parent
TRAMPOLINE = "mutmut.mutation.trampoline"


def tree_problems(root=ROOT):
    """Why this tree cannot be trusted to answer for this code, or [] when it can."""
    root = Path(root)
    tree = root / "mutants"
    config = tomllib.loads((root / "pyproject.toml").read_text())["tool"]["mutmut"]
    scoped = set(config.get("only_mutate") or [])
    problems = []
    for source_path in config["source_paths"]:
        for source in sorted((root / source_path).rglob("*.py")):
            relative = source.relative_to(root).as_posix()
            copy = tree / relative
            if not copy.exists():
                problems.append(f"{relative} was never copied into the tree")
            elif hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(copy.read_bytes()).digest():
                # Byte for byte is right for anything this run was not told to mutate, and is the
                # stale-tree signature for anything it was.
                if relative in scoped:
                    problems.append(f"{relative} is this run's to mutate and was copied unmutated")
            else:
                text = copy.read_text()
                if TRAMPOLINE not in text:
                    problems.append(f"{relative} differs from its source without being mutated")
                else:
                    try:
                        ast.parse(text)
                    except SyntaxError as error:
                        problems.append(f"{relative} does not parse in the tree: {error}")
    return problems


def _report(problems):
    for problem in problems:
        print(f"  {problem}")
    return 1 if problems else 0


def build_tree(max_children=None):
    """Everything mutmut does before it tests anything, and nothing it does after.

    This is the tree the one clean pass runs in. Building it through mutmut's own functions rather
    than copying files is the point: what has to be proven sound is what a run will actually use.
    """
    from mutmut.__main__ import Config, copy_also_copy_files, copy_src_dir, create_mutants

    os.environ["MUTANT_UNDER_TEST"] = "mutant_generation"
    Config.ensure_loaded()
    Path("mutants").mkdir(exist_ok=True)
    copy_src_dir()
    copy_also_copy_files()
    return create_mutants(max_children or os.cpu_count() or 4)


def _instead_of_the_clean_run():
    """Answer mutmut's clean pass from the tree rather than from a test run.

    The forced-fail check reaches the same method and has to keep working, so it is told apart by
    the mutant it selects: the clean pass runs with none, and forced-fail selects `fail`.
    """
    from mutmut.__main__ import PytestRunner

    ran = PytestRunner.run_tests

    def run_tests(self, *, mutant_name, tests):
        if mutant_name is not None or os.environ.get("MUTANT_UNDER_TEST"):
            return ran(self, mutant_name=mutant_name, tests=tests)
        return _report(tree_problems())

    PytestRunner.run_tests = run_tests


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    if argv == ["--build-tree"]:
        stats = build_tree()
        print(f"{stats.mutated} files mutated, {stats.ignored} ignored, {stats.unmodified} unmodified")
        return _report(tree_problems())
    # pytest-django's own project auto-discovery walks up from mutants/ and re-adds this checkout's
    # root to sys.path on every pytest.main() call mutmut makes, undoing the shadowing setup_source_
    # paths() did for that run - which only ever matters for the settings module, since it is the one
    # thing DJANGO_SETTINGS_MODULE always force-imports before mutmut's own path is in effect. Once
    # bound one way in this worker's sys.modules it stays that way, so a settings.py mutant collects
    # the source copy of its own test module beside the mutants/ one mutmut meant to test.
    os.environ.setdefault("PY_IGNORE_IMPORTMISMATCH", "1")
    _instead_of_the_clean_run()
    from mutmut.__main__ import cli

    return cli(["run", *argv], standalone_mode=False) or 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
