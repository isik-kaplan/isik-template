"""Let mutmut mutate decorated functions and classes, instead of skipping them outright.

mutmut skips every `def` carrying a decorator except a bare `@staticmethod`/`@classmethod`, and
every decorated class entirely. In this codebase that is every DRF `@action`, every `@receiver`,
every `@shared_task`, every `@property`, and every `@track_events()` model - a mutmut run over any
of them reports zero mutants and zero survivors, which reads exactly like a file whose tests kill
everything. It is silence, not a clean result.

The reason is codegen rather than intent. A function becomes the original, N mutated copies and a
trampoline that dispatches between them, and each copy is built with `.with_changes(name=...)` only
- so every copy keeps the decorators too. Twelve mutants of a `@shared_task` would register thirteen
tasks; twelve of a `@receiver` would connect thirteen handlers. Emitting the copies undecorated and
leaving the decorators on the trampoline alone - the thing that actually gets called - fixes that:
each decorator still runs exactly once.

Two kinds of decorator have to stay skipped even so. A descriptor (`@property` and the rest of that
protocol) hands its wrapper something that is not a function, so a trampoline cannot sit under it at
all. A memoizer (`@lru_cache` and the like) wraps the dispatch itself, so every mutant after the
first would be answered from the original's cached value and survive regardless of what it changed -
a false kill, worse than no mutant at all.

A decorated *class* is a simpler case: nothing about it is copied - only the methods inside it get
trampolines, each through the same per-function logic above - so recursing into it is always safe.
mutmut fixed exactly this upstream in 3.8.0 (see its own file_mutation.py comment on the change);
this project pins an older release for unrelated reasons (see pyproject.toml), so it is reproduced
here to get the same behavior either way.

Mutations *inside* a decorator's own arguments are dropped regardless of any of this: a decorator-
stripped copy has nothing left for one to apply to, and mutmut would silently emit a twin of the
original that no test could ever kill.

Installed by every script that asks mutmut to generate mutants (mutation_run.py, mutation_queue.py)
before it does - mutmut has no plugin hook for this, `[tool.mutmut]` in pyproject.toml only reaches
the pytest side of a run, not mutant generation itself.
"""

import libcst as cst
from libcst.metadata import PositionProvider


# A decorator a trampoline cannot go under. The descriptor ones hand the wrapper something that is
# not a function; a memoizer caches the dispatch, so a later mutant is answered from the original.
DESCRIPTOR_DECORATORS = frozenset({"property", "cached_property", "classproperty", "lazy_property"})
MEMOISING_DECORATORS = frozenset({"cache", "lru_cache", "cached", "memoize"})
DESCRIPTOR_ATTRIBUTES = frozenset({"setter", "getter", "deleter"})

# The two mutmut already handles: its trampoline binds a classmethod by passing it `is_classmethod`,
# which only works while the copy the trampoline dispatches to is still a classmethod itself.
BINDING_DECORATORS = frozenset({"staticmethod", "classmethod"})

# Ones that only mark the function they are given and hand it back, so every copy wears them too:
# `@makes_exemption` records an exemption where the marked function was called, and the copy the
# trampoline dispatches to is what actually runs.
MARKING_DECORATORS = frozenset({"makes_exemption"})


def _name_of(decorator):
    """The decorator's last name, so `@functools.cache` reads the same as `@cache`, and `@thing.setter`
    is caught by the descriptor protocol's own spelling. None for anything else."""
    while isinstance(decorator, cst.Call):
        decorator = decorator.func
    if isinstance(decorator, cst.Attribute):
        return decorator.attr.value
    if isinstance(decorator, cst.Name):
        return decorator.value
    return None


def defeats_a_trampoline(decorator):
    """Whether a trampoline cannot be put under this decorator."""
    return _name_of(decorator) in DESCRIPTOR_ATTRIBUTES | DESCRIPTOR_DECORATORS | MEMOISING_DECORATORS


def _is_binding(decorator):
    return isinstance(decorator, cst.Name) and decorator.value in BINDING_DECORATORS


def _mutable_despite_its_decorators(node):
    if not node.decorators:
        return False
    if any(defeats_a_trampoline(d.decorator) for d in node.decorators):
        return False
    # mutmut only marks the trampoline `is_classmethod` when that is the function's only decorator,
    # so a classmethod wearing anything else would be bound wrongly. Left alone rather than that.
    if len(node.decorators) > 1 and any(_is_binding(d.decorator) for d in node.decorators):
        return False
    return True


def install():
    """Patch mutmut in this process. Idempotent, so a driver may call it more than once.

    mutmut is imported here rather than at module scope: a test stands a fake in for the package,
    and importing it at import time would bind whichever one happened to be installed first.
    """
    from mutmut.mutation import file_mutation

    if getattr(file_mutation, "_stock_mutmut", None):
        return

    skip_original = file_mutation.MutationVisitor._skip_node_and_children
    arrange_original = file_mutation.function_trampoline_arrangement

    def _skip_node_and_children(self, node):
        # Never the decorator itself: a copy carries none, so a mutation inside one has nothing to
        # apply to and would silently emit a twin of the original that no test can ever kill.
        if isinstance(node, cst.Decorator):
            return True
        if isinstance(node, cst.FunctionDef) and _mutable_despite_its_decorators(node):
            # Asked against the real node: a decorator-stripped copy carries no source position, and
            # the pragma rule reads one off the node it is given - without this a `# pragma: no
            # mutate` on a decorated function would start being mutated instead of staying honoured.
            position = self.get_metadata(PositionProvider, node, None)
            if not (position and position.start.line in self._ignored_node_lines):
                # Every other rule mutmut has, applied as if the decorators were not there.
                return skip_original(self, node.with_changes(decorators=[]))
        if isinstance(node, cst.ClassDef) and node.decorators:
            # A class's own decorator stays on the class untouched either way - nothing about the
            # class itself is ever copied - so the only thing this rule was ever protecting is the
            # methods inside it, which the FunctionDef branch above already governs on its own.
            position = self.get_metadata(PositionProvider, node, None)
            if not (position and position.start.line in self._ignored_node_lines):
                return skip_original(self, node.with_changes(decorators=[]))
        return skip_original(self, node)

    def function_trampoline_arrangement(function, mutants, class_name):
        empty, methods, assignments, names = arrange_original(function, mutants, class_name)
        if not function.decorators:
            return empty, methods, assignments, names
        # The first is the trampoline and keeps every decorator; everything after it is a copy and
        # keeps only whichever of them binds its call (staticmethod/classmethod) or merely marks it.
        carried = [
            d for d in function.decorators if _is_binding(d.decorator) or _name_of(d.decorator) in MARKING_DECORATORS
        ]
        kept = [methods[0], *(node.with_changes(decorators=carried) for node in methods[1:])]
        return empty, kept, assignments, names

    file_mutation.MutationVisitor._skip_node_and_children = _skip_node_and_children
    file_mutation.function_trampoline_arrangement = function_trampoline_arrangement
    # Kept rather than discarded, so `uninstall` can put mutmut back - including a test of what
    # mutmut does on its own, run from inside a process where this is already installed.
    file_mutation._stock_mutmut = (skip_original, arrange_original)


def uninstall():
    """Put stock mutmut back. Idempotent, and a no-op when nothing was installed."""
    from mutmut.mutation import file_mutation

    stock = getattr(file_mutation, "_stock_mutmut", None)
    if not stock:
        return
    file_mutation.MutationVisitor._skip_node_and_children, file_mutation.function_trampoline_arrangement = stock
    del file_mutation._stock_mutmut


def is_installed():
    from mutmut.mutation import file_mutation

    return getattr(file_mutation, "_stock_mutmut", None) is not None
