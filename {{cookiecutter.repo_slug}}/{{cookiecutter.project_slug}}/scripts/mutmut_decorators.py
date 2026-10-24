"""Let mutmut mutate decorated functions and classes, which it otherwise silently skips.

Copies are emitted undecorated and the trampoline keeps the decorators, so each still runs once.
Descriptors and memoizers stay skipped: a trampoline can't sit under them. Backports mutmut 3.8.0's
fix; there is no plugin hook, so every script that generates mutants must call `install()` first.
"""

import libcst as cst
from libcst.metadata import PositionProvider


# A memoizer would answer every later mutant from the original's cached value.
DESCRIPTOR_DECORATORS = frozenset({"property", "cached_property", "classproperty", "lazy_property"})
MEMOISING_DECORATORS = frozenset({"cache", "lru_cache", "cached", "memoize"})
DESCRIPTOR_ATTRIBUTES = frozenset({"setter", "getter", "deleter"})

# mutmut binds via `is_classmethod`, which needs the copy to still be a classmethod.
BINDING_DECORATORS = frozenset({"staticmethod", "classmethod"})

# Marks and returns the function; the copy is what runs, so it must wear the mark too.
MARKING_DECORATORS = frozenset({"makes_exemption"})


def _name_of(decorator):
    while isinstance(decorator, cst.Call):
        decorator = decorator.func
    if isinstance(decorator, cst.Attribute):
        return decorator.attr.value
    if isinstance(decorator, cst.Name):
        return decorator.value
    return None


def defeats_a_trampoline(decorator):
    return _name_of(decorator) in DESCRIPTOR_ATTRIBUTES | DESCRIPTOR_DECORATORS | MEMOISING_DECORATORS


def _is_binding(decorator):
    return isinstance(decorator, cst.Name) and decorator.value in BINDING_DECORATORS


def carried_by_copies(decorators):
    """A lone staticmethod/classmethod, plus any marking decorator."""
    binding = len(decorators) == 1 and _is_binding(decorators[0].decorator)
    return [
        d for d in decorators if (binding and _is_binding(d.decorator)) or _name_of(d.decorator) in MARKING_DECORATORS
    ]


def _mutable_despite_its_decorators(node):
    if not node.decorators:
        return False
    if any(defeats_a_trampoline(d.decorator) for d in node.decorators):
        return False
    # mutmut sets `is_classmethod` only for a sole decorator; otherwise it would bind wrongly.
    if len(node.decorators) > 1 and any(_is_binding(d.decorator) for d in node.decorators):
        return False
    return True


def install():
    """Patch mutmut in this process; idempotent. Imports late because tests swap in a fake mutmut."""
    from mutmut.mutation import file_mutation

    if getattr(file_mutation, "_stock_mutmut", None):
        return

    skip_original = file_mutation.MutationVisitor._skip_node_and_children
    arrange_original = file_mutation.function_trampoline_arrangement

    def _skip_node_and_children(self, node):
        # Copies carry no decorators, so a mutant inside one would be an unkillable twin.
        if isinstance(node, cst.Decorator):
            return True
        if isinstance(node, cst.FunctionDef) and _mutable_despite_its_decorators(node):
            # The stripped copy has no position, so read the no-mutate pragma off the real node.
            position = self.get_metadata(PositionProvider, node, None)
            if not (position and position.start.line in self._ignored_node_lines):
                return skip_original(self, node.with_changes(decorators=[]))
        if isinstance(node, cst.ClassDef) and node.decorators:
            # The class is never copied; its methods are handled by the branch above.
            position = self.get_metadata(PositionProvider, node, None)
            if not (position and position.start.line in self._ignored_node_lines):
                return skip_original(self, node.with_changes(decorators=[]))
        return skip_original(self, node)

    def function_trampoline_arrangement(function, mutants, class_name):
        empty, methods, assignments, names = arrange_original(function, mutants, class_name)
        if not function.decorators:
            return empty, methods, assignments, names
        # The first is the trampoline and keeps every decorator.
        carried = carried_by_copies(function.decorators)
        kept = [methods[0], *(node.with_changes(decorators=carried) for node in methods[1:])]
        return empty, kept, assignments, names

    file_mutation.MutationVisitor._skip_node_and_children = _skip_node_and_children
    file_mutation.function_trampoline_arrangement = function_trampoline_arrangement
    # For `uninstall`, so a test can check stock mutmut in a patched process.
    file_mutation._stock_mutmut = (skip_original, arrange_original)


def uninstall():
    """Put stock mutmut back; a no-op when nothing was installed."""
    from mutmut.mutation import file_mutation

    stock = getattr(file_mutation, "_stock_mutmut", None)
    if not stock:
        return
    file_mutation.MutationVisitor._skip_node_and_children, file_mutation.function_trampoline_arrangement = stock
    del file_mutation._stock_mutmut


def is_installed():
    from mutmut.mutation import file_mutation

    return getattr(file_mutation, "_stock_mutmut", None) is not None
