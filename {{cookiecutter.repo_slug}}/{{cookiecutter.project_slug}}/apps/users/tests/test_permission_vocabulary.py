"""The declaration itself: what a name may look like, and what the dependency graph means.

No database - the vocabulary is code, and the rows are `sync.py`'s problem. Every test here builds its own
`Vocabulary` rather than asserting against the live one, so the graph can be exercised whatever is declared.
"""

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.users.permissions import Declaration, Permission, Vocabulary


def _declaration(name, *, requires=(), delegatable=True):
    return Declaration(name, label=name, delegatable=delegatable, requires=requires)


@pytest.mark.parametrize("name", ["people:read", "people::all", ":read:all", "people:read:all:more"])
def test_a_name_is_where_action_what(name):
    """`has_module_perms` splits on the colons, so a name of another shape would answer about another
    permission's half."""
    with pytest.raises(ValueError, match="where:action:what"):
        _declaration(name)


def test_a_declaration_is_its_own_name():
    """A `str`, so a call site passes it straight to `has_perm` and it compares equal to the same string
    arriving in a token's scopes."""
    declaration = _declaration("people:read:all")

    assert declaration == "people:read:all"
    assert "people:read:all" in {declaration}
    assert repr(declaration) == "<Declaration 'people:read:all'>"
    assert declaration.label == "people:read:all"


def test_requiring_something_undeclared_is_refused():
    with pytest.raises(
        ImproperlyConfigured, match="people:write:all requires 'people:read:all', which is not declared."
    ):
        Vocabulary([_declaration("people:write:all", requires=("people:read:all",))])


def test_the_closure_follows_dependencies_transitively():
    vocabulary = Vocabulary(
        [
            _declaration("people:read:all"),
            _declaration("people:write:all", requires=("people:read:all",)),
            _declaration("people:delete:all", requires=("people:write:all",)),
        ]
    )

    assert vocabulary.closure({"people:delete:all"}) == {"people:delete:all", "people:write:all", "people:read:all"}


def test_a_cycle_back_to_the_root_does_not_abandon_a_sibling_dependency():
    """The memoization skips the one name rather than stopping the walk: a dependency already seen can be
    reached while a sibling of the root is still waiting, and abandoning the walk there under-grants."""
    vocabulary = Vocabulary(
        [
            _declaration("root:read:x", requires=("a:read:x", "b:read:x")),
            _declaration("a:read:x"),
            _declaration("b:read:x", requires=("root:read:x",)),
        ]
    )

    assert vocabulary.closure({"root:read:x"}) == {"root:read:x", "a:read:x", "b:read:x"}


def test_an_undeclared_grant_passes_through_the_closure():
    """A permission dropped from the code outlives its declaration until the next migrate, and a stale
    grant should not raise on the way through."""
    assert Vocabulary([]).closure({"gone:read:all"}) == {"gone:read:all"}


def test_only_the_delegatable_are_an_applications_to_ask_for_in_name_order():
    vocabulary = Vocabulary(
        [_declaration("b:read:x"), _declaration("c:grant:x", delegatable=False), _declaration("a:read:x")]
    )

    assert vocabulary.delegatable() == ["a:read:x", "b:read:x"]
    assert vocabulary.not_delegatable(["b:read:x", "c:grant:x", "nobody:declared:this"]) == [
        "c:grant:x",
        "nobody:declared:this",
    ]


def test_the_live_vocabulary_declares_what_exists_today():
    assert set(Permission.declared()) == {"users:manage:user", "users:grant:rights"}
    assert Permission.USERS_GRANT_RIGHTS.requires == ("users:manage:user",)
    assert all(declaration.delegatable for declaration in Permission.declared())
