"""Mutants as the tree generates them, read back from the source rather than from a built tree."""

import difflib
from functools import cache
from pathlib import Path

import tomllib

from scripts.mutation_naming import apply as name_mutants_by_change
from scripts.mutation_naming import module_of
from scripts.mutation_queue import EQUIVALENTS, EXEMPTIONS, ROOT, function_of
from scripts.mutmut_decorators import install as install_mutmut_decorators


def _patched():
    """Both patches, before anything generates: without them a decorated function contributes no
    names, and every other name is positional and matches nothing in either registry."""
    install_mutmut_decorators()
    name_mutants_by_change()


@cache
def mutated(relative):
    """mutmut's own output for one source path, relative to the project root."""
    from mutmut.__main__ import mutate_file_contents

    _patched()
    return mutate_file_contents(relative, (ROOT / relative).read_text())


def names_in(relative):
    """Every mutant of one source path, fully qualified the way mutmut records a verdict."""
    return [f"{module_of(relative)}.{name}" for name in mutated(relative).mutant_names]


def source_of(name):
    """The source path a mutant or function name lives in, or None. Walked back from the longest
    dotted prefix, so a package's `__init__.py` answers only when no module of that name does."""
    parts = name.split(".")
    for cut in range(len(parts) - 1, 0, -1):
        for candidate in (Path(*parts[:cut]).with_suffix(".py"), Path(*parts[:cut], "__init__.py")):
            if (ROOT / candidate).exists():
                return str(candidate)
    return None


def diff_of(name):
    """The lines a mutant changes against the unmutated copy, or None when it is not generated."""
    relative = source_of(name)
    if relative is None:
        return None
    result = mutated(relative)
    short = name.removeprefix(module_of(relative) + ".")
    span = result.line_span_by_function_name.get(short)
    original = result.line_span_by_function_name.get(function_of(short) + "__mutmut_orig")
    if span is None or original is None:
        return None
    lines = result.code.splitlines()
    diff = difflib.unified_diff(
        lines[original.start - 1 : original.end], lines[span.start - 1 : span.end], lineterm="", n=0
    )
    # The renamed `def` line differs in every mutant and says nothing, so it is dropped by content -
    # a hunk lists all its removals before its additions, and a fixed slice would eat a real line.
    return [
        line
        for line in diff
        if line.startswith(("+", "-")) and not line.startswith(("+++", "---")) and "__mutmut_" not in line
    ]


def registered():
    """(single mutants, whole functions) the two registries already account for."""
    single = tomllib.loads(EQUIVALENTS.read_text()) if EQUIVALENTS.exists() else {}
    whole = tomllib.loads(EXEMPTIONS.read_text()) if EXEMPTIONS.exists() else {}
    return set(single), set(whole)


def is_registered(name, single, whole):
    return name in single or function_of(name) in whole
