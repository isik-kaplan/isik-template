"""Mutants as the tree generates them, read from source rather than a built tree."""

import difflib
from functools import cache
from pathlib import Path

import tomllib

from scripts.mutation_naming import apply as name_mutants_by_change
from scripts.mutation_naming import module_of
from scripts.mutation_queue import EQUIVALENTS, EXEMPTIONS, ROOT, function_of
from scripts.mutmut_decorators import install as install_mutmut_decorators


def _patched():
    """Both patches, or names won't match the tree's or the registries'."""
    install_mutmut_decorators()
    name_mutants_by_change()


@cache
def mutated(relative):
    from mutmut.__main__ import mutate_file_contents

    _patched()
    return mutate_file_contents(relative, (ROOT / relative).read_text())


def names_in(relative):
    return [f"{module_of(relative)}.{name}" for name in mutated(relative).mutant_names]


def source_of(name):
    """The source path a name lives in, or None; a module wins over a package `__init__.py`."""
    parts = name.split(".")
    for cut in range(len(parts) - 1, 0, -1):
        for candidate in (Path(*parts[:cut]).with_suffix(".py"), Path(*parts[:cut], "__init__.py")):
            if (ROOT / candidate).exists():
                return str(candidate)
    return None


def diff_of(name):
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
    # Drop the renamed `def` line by content; a fixed slice would eat a real line.
    return [
        line
        for line in diff
        if line.startswith(("+", "-")) and not line.startswith(("+++", "---")) and "__mutmut_" not in line
    ]


def registered():
    single = tomllib.loads(EQUIVALENTS.read_text()) if EQUIVALENTS.exists() else {}
    whole = tomllib.loads(EXEMPTIONS.read_text()) if EXEMPTIONS.exists() else {}
    return set(single), set(whole)


def is_registered(name, single, whole):
    return name in single or function_of(name) in whole
