"""Name a mutant by a hash of its change, not its position, so an equivalents entry can't drift onto another.

Wraps mutmut's internal `function_trampoline_arrangement` (no hook exists) rather than reimplementing it.
"""

import hashlib
from collections import Counter

import libcst as cst


SUFFIX = "__mutmut"
LENGTH = 12
MARKER = "names_mutants_by_change"


def module_of(relative_path):
    """The dotted module mutmut files mutants under; it drops `.__init__`, so must we."""
    return str(relative_path).removesuffix(".py").replace("/", ".").removesuffix(".__init__")


def identity(mutation):
    render = cst.Module([]).code_for_node
    change = f"{render(mutation.original_node)}\n->\n{render(mutation.mutated_node)}"
    return hashlib.sha256(change.encode()).hexdigest()[:LENGTH]


def identities(mutants):
    """One name per mutant; only an identical repeated change in one function gets a number."""
    seen = Counter()
    for mutant in mutants:
        change = identity(mutant)
        seen[change] += 1
        yield change if seen[change] == 1 else f"{change}_{seen[change] - 1}"


def renamed(arrangement, function, mutants, class_name):
    from mutmut.mutation.file_mutation import build_mutants_dict_and_name, mangle_function_name

    mutants = list(mutants)
    declaration, methods, _, positional = arrangement(function, mutants, class_name)

    mangled_name = mangle_function_name(name=function.name.value, class_name=class_name) + SUFFIX
    names = [f"{mangled_name}__{change}" for change in identities(mutants)]
    # By name, not position, so a node upstream adds later isn't renamed into a mutant.
    renaming = dict(zip(positional, names, strict=True))
    methods = [
        node.with_changes(name=cst.Name(renaming[node.name.value])) if node.name.value in renaming else node
        for node in methods
    ]

    dispatch = build_mutants_dict_and_name(
        mangled_name=mangled_name, mutants=names, mutants_dict_name=f"mutants_{mangled_name}", class_name=class_name
    )
    assignment = list(cst.parse_module(dispatch).body)
    assignment[0] = assignment[0].with_changes(leading_lines=[cst.EmptyLine()])
    return declaration, methods, assignment, names


def apply():
    """Install the naming; idempotent. Imports late so it wraps whatever arrangement a test installed."""
    from mutmut.mutation import file_mutation

    current = file_mutation.function_trampoline_arrangement
    if getattr(current, MARKER, False):
        return

    def function_trampoline_arrangement(function, mutants, class_name):
        return renamed(current, function, mutants, class_name)

    setattr(function_trampoline_arrangement, MARKER, True)
    file_mutation.function_trampoline_arrangement = function_trampoline_arrangement
