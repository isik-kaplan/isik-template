"""A `verified_by` spares a mutant its re-run, which is worth it only while the named test exists."""

import ast
import re
from pathlib import Path

import pytest
import tomllib


ROOT = Path(__file__).resolve().parents[3]
EQUIVALENTS = ROOT / "mutation-equivalents.toml"


def _verified():
    entries = tomllib.loads(EQUIVALENTS.read_text())
    return sorted((name, entry["verified_by"]) for name, entry in entries.items() if entry.get("verified_by"))


def _readable(name):
    """mutmut re-runs by node id, and a `::` or a mangled name's `ǁ` makes one pytest cannot resolve."""
    return re.sub(r"[^0-9A-Za-z_]", "_", name.rpartition(".")[2])[:60]


def test_the_registry_has_verified_entries_to_check():
    """A guard on the guard below: with nothing to parametrize over it would pass vacuously."""
    assert _verified()


@pytest.mark.parametrize("name,node_id", _verified(), ids=[_readable(name) for name, _ in _verified()])
def test_a_verified_by_names_a_test_that_exists(name, node_id):
    """Otherwise a typo turns an exemption into one nothing re-checks, silently."""
    path, _, test = node_id.partition("::")
    # A parametrized id carries its case in brackets; the function is what has to exist.
    test = test.partition("[")[0]
    module = ROOT / path

    assert module.is_file(), f"{name} names {path}, which is not a file"
    defined = {
        node.name
        for node in ast.walk(ast.parse(module.read_text()))
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name.startswith("test")
    }
    assert test in defined, f"{name} names {test}, which {path} does not define"
