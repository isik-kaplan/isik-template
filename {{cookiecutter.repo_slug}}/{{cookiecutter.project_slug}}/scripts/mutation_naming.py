"""Name a mutant after the mutation it makes, rather than its position in the function.

mutmut numbers mutants per function, so `x_main__mutmut_203` says only "the 203rd mutation inside
`main`", and editing that function moves every number after the edit - leaving an entry in
`mutation-equivalents.toml` excusing a mutation its reason no longer describes. Hashing the change
itself (what was replaced, and with what) gives a name that follows the mutation wherever it lands,
and stops resolving the moment that mutation goes away.

The suffix stays opaque downstream: mutmut and these scripts split on `__mutmut_` and keep the
function half, and the trampoline only ever looks a name up in the dict built here.

`function_trampoline_arrangement` is internal and has no hook, so it is replaced - but the
replacement calls whatever was installed before it and renames what comes back, rather than
reimplementing it. The trampoline, the unmutated copy and the classmethod argument stay upstream's to
get right, and the decorator patch (mutmut_decorators.py) composes with this in either order.
"""

import hashlib
from collections import Counter

import libcst as cst


SUFFIX = "__mutmut"
LENGTH = 12
# Set on the installed arrangement, so a second `apply` can tell it is already in place.
MARKER = "names_mutants_by_change"


def module_of(relative_path):
    """The dotted module mutmut files a source path's mutants under.

    A package's `__init__.py` is the package itself - mutmut's own naming drops the `.__init__` -
    so a name generated here without that strip is one no verdict is ever recorded against, and the
    mutant reads as "not checked" for good.
    """
    return str(relative_path).removesuffix(".py").replace("/", ".").removesuffix(".__init__")


def identity(mutation):
    """The change itself, hashed: what it replaced, and what with."""
    render = cst.Module([]).code_for_node
    change = f"{render(mutation.original_node)}\n->\n{render(mutation.mutated_node)}"
    return hashlib.sha256(change.encode()).hexdigest()[:LENGTH]


def identities(mutants):
    """One name per mutant, in source order.

    The same change can be made twice in one function (two `"."` literals mutated the same way), and
    a shared name would leave the second unreachable through the trampoline. Only an exact repeat is
    numbered, so a mutation unique in its function keeps a name nothing else there can move.
    """
    seen = Counter()
    for mutant in mutants:
        change = identity(mutant)
        seen[change] += 1
        yield change if seen[change] == 1 else f"{change}_{seen[change] - 1}"


def renamed(arrangement, function, mutants, class_name):
    """`arrangement`'s output, with every mutant renamed after the change it makes."""
    from mutmut.mutation.file_mutation import build_mutants_dict_and_name, mangle_function_name

    mutants = list(mutants)
    declaration, methods, _, positional = arrangement(function, mutants, class_name)

    mangled_name = mangle_function_name(name=function.name.value, class_name=class_name) + SUFFIX
    names = [f"{mangled_name}__{change}" for change in identities(mutants)]
    # Matched by the name upstream gave each node rather than by position, so a release that adds a
    # node to the arrangement carries it through untouched instead of having a mutant renamed onto it.
    renaming = dict(zip(positional, names, strict=True))
    methods = [
        node.with_changes(name=cst.Name(renaming[node.name.value])) if node.name.value in renaming else node
        for node in methods
    ]

    # Rebuilt rather than rewritten: upstream's dict maps its own names, which no longer exist.
    dispatch = build_mutants_dict_and_name(
        mangled_name=mangled_name, mutants=names, mutants_dict_name=f"mutants_{mangled_name}", class_name=class_name
    )
    assignment = list(cst.parse_module(dispatch).body)
    assignment[0] = assignment[0].with_changes(leading_lines=[cst.EmptyLine()])
    return declaration, methods, assignment, names


def apply():
    """Install the naming in this process. Idempotent, since more than one entry point calls it.

    mutmut is imported here rather than at module scope, for the same reason mutmut_decorators.py
    does: a test may stand a different arrangement in, and this has to wrap whichever one is current.
    """
    from mutmut.mutation import file_mutation

    current = file_mutation.function_trampoline_arrangement
    if getattr(current, MARKER, False):
        return

    def function_trampoline_arrangement(function, mutants, class_name):
        return renamed(current, function, mutants, class_name)

    setattr(function_trampoline_arrangement, MARKER, True)
    file_mutation.function_trampoline_arrangement = function_trampoline_arrangement
