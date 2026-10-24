"""`mutmut run`, with its clean test pass replaced by a cheap check that the tree is sound.

Unmutated copies must match their source byte for byte; mutated ones must parse and hold a trampoline.
The clean pass itself runs once per commit in CI, against `--build-tree`.

    python scripts/mutation_run.py <mutant name> ...
    python scripts/mutation_run.py --build-tree     # for the step that runs the suite in it

Run by path, not `-m`: `scripts.__path__` would bind to one tree in every child mutmut forks.
"""

import ast
import hashlib
import os
import sys
from pathlib import Path

import mutation_naming
import mutmut_decorators
import tomllib


ROOT = Path(__file__).resolve().parent.parent
TRAMPOLINE = "mutmut.mutation.trampoline"

# Before any mutant is generated, and matching the queue, or its names never resolve.
mutmut_decorators.install()
mutation_naming.apply()


def tree_problems(root=ROOT):
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
                # Unchanged is right unless this run was told to mutate it.
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
    """Build the tree through mutmut's own functions, so the clean pass checks what a run will use."""
    from mutmut.__main__ import Config, copy_also_copy_files, copy_src_dir, create_mutants

    os.environ["MUTANT_UNDER_TEST"] = "mutant_generation"
    Config.ensure_loaded()
    Path("mutants").mkdir(exist_ok=True)
    copy_src_dir()
    copy_also_copy_files()
    return create_mutants(max_children or os.cpu_count() or 4)


def _instead_of_the_clean_run():
    """Answer mutmut's clean pass from the tree; forced-fail reaches here too but selects a mutant."""
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
    # pytest-django re-adds the checkout root to sys.path, so a settings mutant collects both test copies.
    os.environ.setdefault("PY_IGNORE_IMPORTMISMATCH", "1")
    _instead_of_the_clean_run()
    from mutmut.__main__ import cli

    return cli(["run", *argv], standalone_mode=False) or 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
