"""Mutants that differ only in the case of a string literal, flagged where their verdicts disagree.

One of each such pair is wrong. Flags rather than asserts: two spellings of a dict key genuinely differ.

    python -m scripts.case_only_mutants            # after a run, reading mutants/
    python -m scripts.case_only_mutants --tree somewhere/else
"""

import argparse
import ast
import json
import sys
from collections import defaultdict
from pathlib import Path

import tomllib


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TREE = ROOT / "mutants"
EQUIVALENTS = ROOT / "mutation-equivalents.toml"
ORIGINAL = "__mutmut_orig"
MUTANT = "__mutmut_"
# An exempted mutant is never run; its registry entry counts as a survival.
SURVIVED = "survived"

CLEAN = "Every case-only site was decided the same way for all of its spellings."
PREAMBLE = (
    "One of each pair is wrong. Where case does not matter they all survive; where it does,\n"
    "they all die. Read them - this is not a rule, it is a question.\n"
)


def _functions(module):
    """Methods too: mutmut flattens mutants to module level but leaves the originals inside the class."""
    found = {}
    for node in ast.walk(module):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            found[node.name] = node
    return found


def _literals(function):
    """String constants in source order, minus the docstring (mutmut mutates it, nothing can kill it)."""
    body = function.body[1:] if ast.get_docstring(function) is not None else function.body
    return [
        node.value
        for statement in body
        for node in ast.walk(statement)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ]


def case_only_sites(tree=DEFAULT_TREE):
    """{(module, function, literal): [names]} for sites with more than one case spelling."""
    sites = defaultdict(list)
    for path in sorted(Path(tree).rglob("*.py")):
        relative = path.relative_to(tree)
        if "mutants" in relative.parts:
            continue
        try:
            module = ast.parse(path.read_text())
        except (OSError, SyntaxError):
            continue
        dotted = str(relative).removesuffix(".py").replace("/", ".").removesuffix(".__init__")
        functions = _functions(module)
        originals = {name.removesuffix(ORIGINAL): fn for name, fn in functions.items() if name.endswith(ORIGINAL)}
        for name, function in functions.items():
            base = next((base for base in originals if name.startswith(base + MUTANT)), None)
            if base is None:
                continue
            before, after = _literals(originals[base]), _literals(function)
            try:
                # A mutant that adds or drops a literal shifts every later pair; skip it.
                changed = [(was, now) for was, now in zip(before, after, strict=True) if was != now]
            except ValueError:
                continue
            if len(changed) != 1:
                continue
            was, now = changed[0]
            if was.casefold() != now.casefold():
                continue
            sites[(dotted, base, was)].append(f"{dotted}.{name}")
    return {site: names for site, names in sites.items() if len(names) > 1}


def verdicts(tree=DEFAULT_TREE, equivalents=EQUIVALENTS):
    """Verdict by mutant name; an exempt mutant counts as survived."""
    from mutmut.__main__ import status_by_exit_code

    decided = {}
    for meta in sorted(Path(tree).rglob("*.py.meta")):
        try:
            recorded = json.loads(meta.read_text())["exit_code_by_key"]
        # An interrupted run can leave a half-written meta.
        except (OSError, json.JSONDecodeError, KeyError):
            continue
        for name, exit_code in recorded.items():
            decided[name] = status_by_exit_code[exit_code]
    if equivalents.exists():
        for name in tomllib.loads(equivalents.read_text()):
            decided.setdefault(name, SURVIVED)
    return decided


def disagreements(tree=DEFAULT_TREE, equivalents=EQUIVALENTS):
    """Sites whose spellings were not all decided the same way, with what each one got."""
    decided = verdicts(tree, equivalents)
    found = {}
    for site, names in sorted(case_only_sites(tree).items()):
        given = {name: decided[name] for name in sorted(names) if name in decided}
        if len(set(given.values())) > 1:
            found[site] = given
    return found


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tree", type=Path, default=DEFAULT_TREE)
    arguments = parser.parse_args(argv)

    found = disagreements(arguments.tree)
    if not found:
        print(CLEAN)
        return 0

    print(f"{len(found)} site(s) where two spellings of one literal were decided differently.")
    print(PREAMBLE)
    for (module, function, literal), given in found.items():
        print(f"{module}.{function} - {literal!r}")
        for name, verdict in given.items():
            print(f"    {verdict:<10} {name}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
