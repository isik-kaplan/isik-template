#!/usr/bin/env python3
"""One of a thing per file, a folder once there is more than one, and nothing else in there.

Two halves of one standing rule, and a file has to pass both:

1. **A module becomes a folder when it holds more than one of the thing its name declares.**
   `serializers.py` with two serializers is `serializers/` with a file each; `views.py` with one
   view is already right.
2. **A file holds only what its name declares.** A helper does not become a serializer by sitting in
   a file full of them - it belongs on the model, on a queryset, or in a utility module of its own.

A class counts as its file's kind by its own name, by a base it is written against, or by being
named for the file holding it - so `IsOwner(BasePermission)` is a permission, and `history.py` may
hold `HistoryMixin`. A function counts when it is the factory the file is named for. Everything else
in a governed file is a stranger.

A kind is recognised by the name of the module or of the folder it sits in, and its members by the
word their class names carry - `Serializer`, `ViewSet`, `Filter` and so on. That is what keeps the
check honest about what looks like several classes and is one concept: a model with its queryset and
its manager trips nothing, because only one of the three is a model.

`apps/common` is the project's utility package, so a file there may hold a mixin or helpers under a
name that declares something else - it is exempt from the second half and only the second.

A deliberate exception goes in EXCEPTIONS below with the reason it is one. An exception that no longer
excuses anything fails the check too, so the list cannot outlive what it was written for.

Standard library only: the pre-commit hook runs this straight off the checkout, with no container.
"""

import ast
import sys
from pathlib import Path


# This file lives in `<backend>/scripts`, so the tree it judges is one level up.
ROOT = Path(__file__).resolve().parents[1]

# This project's own code. `.venv` lives under the same root and is full of modules written to other
# conventions, which are none of this check's business.
OURS = ("apps", "{{ cookiecutter.project_slug }}", "scripts")

# Folder or module name -> the words its members' names carry. A model carries none, so `models` is
# read the other way round: anything that is not plumbing for a model is one.
KINDS = {
    "serializers": ("Serializer",),
    "viewsets": ("ViewSet",),
    "views": ("View",),
    "forms": ("Form",),
    "filters": ("Filter",),
    "fields": ("Field",),
    "permissions": ("Permission",),
    "adapters": ("Adapter",),
    "backends": ("Backend",),
    "middleware": ("Middleware",),
    "admin": ("Admin", "Inline"),
    "models": None,
}

# A model's companions, which are the same concept as the model and never a second one.
MODEL_PLUMBING = ("Manager", "QuerySet")

UTILITY_PACKAGE = "apps/common/"

EXCEPTIONS = {
    "apps/users/models/user.py": (
        "`language_choices` is a callable so the migration does not freeze this project's languages, "
        "and a migration can only name a callable that sits at module level."
    ),
    "apps/users/api/viewsets/user.py": (
        "`_mark_partial` is split out of `update_me` only so mutation-equivalents.toml can excuse its "
        "equivalent mutants without excusing `update_me`. It is part of that action, not a utility."
    ),
}


def _base_names(node):
    """What this class is written as inheriting from, by last dotted segment - `serializers.Serializer`
    and a bare `Serializer` both answer `Serializer`, which is all this needs to know."""
    for base in node.bases:
        if isinstance(base, ast.Attribute):
            yield base.attr
        elif isinstance(base, ast.Name):
            yield base.id


def _declared_by(stem):
    """The file's own name, as a class would spell it: `health_check` -> `HealthCheck`."""
    return "".join(word.title() for word in stem.split("_"))


def _is_of_kind(node, words, stem):
    names = [node.name, *_base_names(node)]
    if any(word in name for name in names for word in words):
        return True
    return node.name.startswith(_declared_by(stem))


def members_of(tree, words, stem):
    """The top-level classes in `tree` that are of its file's kind."""
    classes = [node for node in tree.body if isinstance(node, ast.ClassDef)]
    if words is None:
        return [node.name for node in classes if not node.name.endswith(MODEL_PLUMBING)]
    return [node.name for node in classes if _is_of_kind(node, words, stem)]


def strangers_in(tree, words, stem):
    """What a file of this kind holds that is not of it: a class of another kind, or any function
    other than the factory the file is named for."""
    foreign = []
    if words is not None:
        foreign = [
            node.name for node in tree.body if isinstance(node, ast.ClassDef) and not _is_of_kind(node, words, stem)
        ]
    functions = [
        node.name
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name != stem
        and not _generated_by_mutmut(node.name)
    ]
    return foreign + functions


def _generated_by_mutmut(name):
    """mutmut rewrites a function into `x_<name>__mutmut_<n>` variants beside a dispatcher, and the whole
    suite - this gate's own test included - runs in that tree."""
    return name.startswith("x_") and "__mutmut_" in name


def kind_of(path):
    """Which kind governs this file - its own name, or the folder holding it."""
    if path.name != "__init__.py" and path.stem in KINDS:
        return path.stem
    return path.parent.name if path.parent.name in KINDS else None


def complaints():
    excused = set()
    for top in OURS:
        for path in sorted((ROOT / top).rglob("*.py")):
            relative = path.relative_to(ROOT).as_posix()
            if "/migrations/" in relative or "/tests/" in relative:
                continue
            found = list(_complaint(path, relative))
            if relative in EXCEPTIONS:
                excused.update([relative] if found else [])
                continue
            yield from found
    for relative in sorted(set(EXCEPTIONS) - excused):
        yield relative, "stale", []


def _complaint(path, relative):
    kind = kind_of(path)
    if kind is None:
        return
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = members_of(tree, KINDS[kind], path.stem)
    if len(found) > 1:
        yield relative, "folder" if path.stem == kind else "file", found
    strangers = [] if relative.startswith(UTILITY_PACKAGE) else strangers_in(tree, KINDS[kind], path.stem)
    if strangers:
        yield relative, "stranger", strangers


ADVICE = {
    "folder": "Make it a folder with one of them per file.",
    "file": "One per file - give the others their own.",
    "stranger": "A file holds what its name declares - move these onto the model, or into a utility module.",
    "stale": "Nothing here needs excusing any more - take it out of EXCEPTIONS.",
    "exception": "A deliberate exception goes in EXCEPTIONS in this script, with its reason.",
}


def main():
    failed = False
    for relative, where, found in complaints():
        failed = True
        if where == "stale":
            print(f"layout-check: {relative} is in EXCEPTIONS, and passes without it.", file=sys.stderr)
        elif where == "stranger":
            print(f"layout-check: {relative} also holds {', '.join(found)}.", file=sys.stderr)
        else:
            print(f"layout-check: {relative} holds {len(found)}: {', '.join(found)}.", file=sys.stderr)
        print(f"              {ADVICE[where]}", file=sys.stderr)
    if failed:
        print(f"              {ADVICE['exception']}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
