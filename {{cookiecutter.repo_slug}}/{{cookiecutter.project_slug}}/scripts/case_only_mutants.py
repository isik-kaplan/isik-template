"""Mutants that differ only in the case of a string literal, and whether they agree.

mutmut mutates a string literal several ways, two of them its upper- and lower-cased spellings. At a
site where case does not matter - a SQL keyword, a model name the registry folds, a response header -
both spellings are the same call and both should survive. Where it does, both should die. A site
whose two spellings disagree is a fact about the measurement rather than about the code: one of the
verdicts is wrong, and which one is a question for whoever reads this.

Flags rather than asserts, deliberately. The obvious rule is too broad: two spellings of a dict key
are genuinely different, so "they must agree" would be false here and the check would be reporting
its own rule rather than a defect.

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
# Everything mutmut does not call `killed`. An exempted mutant is never run, and the registry entry
# is a standing claim that nothing kills it.
SURVIVED = "survived"

CLEAN = "Every case-only site was decided the same way for all of its spellings."
# Printed above the list, because the list is a question rather than a verdict.
PREAMBLE = (
    "One of each pair is wrong. Where case does not matter they all survive; where it does,\n"
    "they all die. Read them - this is not a rule, it is a question.\n"
)


def _functions(module):
    """Every function in the module, including methods, by name.

    mutmut flattens a method to `xǁClassǁmethod__mutmut_n` at the module level, but the originals it
    copies keep their place inside the class.
    """
    found = {}
    for node in ast.walk(module):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            found[node.name] = node
    return found


def _literals(function):
    """The string constants in the function body, in source order, with the docstring left out.

    The docstring is a string constant like any other and mutmut mutates it, which would make every
    docstring a case-only site that nothing can kill.
    """
    body = function.body[1:] if ast.get_docstring(function) is not None else function.body
    return [
        node.value
        for statement in body
        for node in ast.walk(statement)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ]


def case_only_sites(tree=DEFAULT_TREE):
    """Each site that has more than one case spelling, as {(module, function, literal): [names]}.

    A site with one spelling is dropped: an already-lower-cased literal has no distinct lower-cased
    mutant, so there is nothing for its verdict to disagree with.
    """
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
                # `strict`, and no length test beside it: a mutation that adds or drops a literal
                # shifts every comparison after it, and a truncated zip reads the shift as a change.
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
    """What the run decided about each mutant, by name.

    An exempt mutant has no verdict of its own - phase one does not run it - and the entry claiming
    nothing kills it is read as the survival it asserts.
    """
    from mutmut.__main__ import status_by_exit_code

    decided = {}
    # Sorted, so which meta is read first is a property of the tree rather than of the filesystem.
    for meta in sorted(Path(tree).rglob("*.py.meta")):
        try:
            recorded = json.loads(meta.read_text())["exit_code_by_key"]
        # A meta an interrupted run left half-written holds neither readable JSON nor the key.
        except (OSError, json.JSONDecodeError, KeyError):
            continue
        # The keys are already the dotted names the queue and the registry use.
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
