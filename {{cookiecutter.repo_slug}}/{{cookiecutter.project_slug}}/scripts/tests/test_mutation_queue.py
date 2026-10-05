"""Which mutants phase one runs, which it skips, and which the re-check step re-runs."""

import re

from scripts import mutation_queue


EQUIVALENT = "apps.users.adapters.xǁAdapterǁpopulate__mutmut__1a2b3c4d5e6f"
VERIFIED = "apps.common.middleware.xǁMiddlewareǁ__call____mutmut__abcdefabcdef"
OTHER_MUTANT_SAME_FUNCTION = "apps.users.adapters.xǁAdapterǁpopulate__mutmut__ffffffffffff"
UNTRACEABLE = "app.settings.x_social__mutmut__000000000000"
ORDINARY = "apps.users.views.x_me__mutmut__111111111111"

IN_TREE = {EQUIVALENT, VERIFIED, OTHER_MUTANT_SAME_FUNCTION, UNTRACEABLE, ORDINARY}
EQUIVALENTS = {EQUIVALENT: {"reason": "r"}, VERIFIED: {"reason": "r", "verified_by": "a.py::test_b"}}
EXEMPTIONS = {"app.settings.x_social": {"reason": "r"}}


def test_an_equivalent_excuses_its_own_mutant_and_no_other_in_the_function():
    skipped = mutation_queue.skipped(IN_TREE, EQUIVALENTS, EXEMPTIONS)

    assert skipped == {EQUIVALENT, VERIFIED, UNTRACEABLE}
    assert OTHER_MUTANT_SAME_FUNCTION not in skipped


def test_a_verified_entry_is_rechecked_by_its_test_rather_than_a_rerun():
    assert mutation_queue.rechecked(IN_TREE, EQUIVALENTS, EXEMPTIONS) == {EQUIVALENT, UNTRACEABLE}


def test_an_entry_for_a_mutant_the_tree_does_not_hold_is_never_named():
    """Naming another tree's mutant to mutmut is an error, so the registries are intersected."""
    assert mutation_queue.rechecked({ORDINARY}, EQUIVALENTS, EXEMPTIONS) == set()


def test_the_queue_names_a_package_init_the_way_mutmut_does(tmp_path, monkeypatch):
    """An `__init__.py` named with its `.__init__` kept is queued under a name nothing answers to, and
    every mutant in it comes back "not checked" - read downstream as a survivor."""
    (tmp_path / "pkg").mkdir()
    (tmp_path / "pkg" / "__init__.py").write_text("def double(a):\n    return a * 2\n")
    (tmp_path / "pkg" / "tests").mkdir()
    (tmp_path / "pkg" / "tests" / "test_x.py").write_text("def test_x():\n    assert 1 * 2\n")
    (tmp_path / "pyproject.toml").write_text('[tool.mutmut]\nsource_paths = ["pkg"]\ndo_not_mutate = ["*/tests/*"]\n')
    monkeypatch.setattr(mutation_queue, "ROOT", tmp_path)

    names = mutation_queue._in_tree()

    assert names
    assert all(re.fullmatch(r"pkg\.x_double__mutmut__[0-9a-f]{12}(_\d+)?", name) for name in names)
