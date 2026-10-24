#!/usr/bin/env python3
"""One of a thing per file, a folder once there is more than one, and nothing else in there.

A class is of its file's kind by its name, a base, or being named for the file; a function only if it is
the file's namesake factory. `apps/common` may hold strangers. A stale EXCEPTIONS entry also fails.
Standard library only: the pre-commit hook runs it without a container.
"""

import ast
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

# Not the whole root: `.venv` lives there too.
OURS = ("apps", "{{ cookiecutter.project_slug }}", "scripts")

# Name -> words its members carry. `models` is inverted: anything not model plumbing is a model.
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

MODEL_PLUMBING = ("Manager", "QuerySet")

UTILITY_PACKAGE = "apps/common/"

EXCEPTIONS = {
    "apps/users/permissions.py": (
        "The permission vocabulary: Declaration, Vocabulary and Permission are one concept, and the "
        "registry is only readable as a single list."
    ),
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
    for base in node.bases:
        if isinstance(base, ast.Attribute):
            yield base.attr
        elif isinstance(base, ast.Name):
            yield base.id


def _declared_by(stem):
    return "".join(word.title() for word in stem.split("_"))


def _is_of_kind(node, words, stem):
    names = [node.name, *_base_names(node)]
    if any(word in name for name in names for word in words):
        return True
    return node.name.startswith(_declared_by(stem))


def members_of(tree, words, stem):
    classes = [node for node in tree.body if isinstance(node, ast.ClassDef)]
    if words is None:
        return [node.name for node in classes if not node.name.endswith(MODEL_PLUMBING)]
    return [node.name for node in classes if _is_of_kind(node, words, stem)]


def strangers_in(tree, words, stem):
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
    """This gate's own test also runs inside the mutmut tree."""
    return name.startswith("x_") and "__mutmut_" in name


def kind_of(path):
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
