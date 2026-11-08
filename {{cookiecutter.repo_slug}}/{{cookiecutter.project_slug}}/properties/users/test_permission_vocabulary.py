import pytest
from django.core.exceptions import ImproperlyConfigured
from hypothesis import given
from hypothesis import strategies as st

from apps.users.permissions import VOCABULARY, Declaration, Vocabulary


NAMES = [f"app:act:{thing}" for thing in "abcdef"]
UNDECLARED = "app:act:nobody"


@st.composite
def vocabularies(draw):
    """Any graph over a few names, cycles included: nothing in a declaration forbids one."""
    declared = draw(st.lists(st.sampled_from(NAMES), min_size=1, unique=True))
    return Vocabulary(
        [
            Declaration(
                name,
                label=name,
                delegatable=draw(st.booleans()),
                requires=draw(st.lists(st.sampled_from(declared), unique=True, max_size=3)),
            )
            for name in declared
        ]
    )


ASKED = st.sets(st.sampled_from([*NAMES, UNDECLARED]))


def reachable(vocabulary, names):
    """The closure written a second time, as a worklist rather than a recursion."""
    seen, waiting = set(), list(names)
    while waiting:
        name = waiting.pop()
        if name not in seen:
            seen.add(name)
            declaration = vocabulary.by_name.get(name)
            waiting.extend(declaration.requires if declaration else ())
    return seen


@given(vocabulary=vocabularies(), names=ASKED)
def test_the_closure_is_everything_reachable_from_what_was_asked(vocabulary, names):
    assert vocabulary.closure(names) == reachable(vocabulary, names)


@given(vocabulary=vocabularies(), names=ASKED)
def test_expanding_an_expansion_adds_nothing(vocabulary, names):
    once = vocabulary.closure(names)
    assert vocabulary.closure(once) == once


@given(vocabulary=vocabularies(), smaller=ASKED, more=ASKED)
def test_holding_more_never_expands_to_less(vocabulary, smaller, more):
    assert vocabulary.closure(smaller) <= vocabulary.closure(smaller | more)


@given(vocabulary=vocabularies(), names=ASKED)
def test_only_a_declared_delegatable_name_is_delegatable(vocabulary, names):
    refused = vocabulary.not_delegatable(names)

    assert refused == sorted(refused)
    assert set(refused) == {
        name for name in names if name not in vocabulary.by_name or not vocabulary.by_name[name].delegatable
    }
    # Every declared name is delegatable or refused, never both.
    everything = list(vocabulary.by_name)
    assert sorted(vocabulary.delegatable() + vocabulary.not_delegatable(everything)) == sorted(everything)


@given(name=st.sampled_from(NAMES), missing=st.sampled_from([*NAMES, UNDECLARED]))
def test_a_requirement_nobody_declared_is_refused(name, missing):
    if missing == name:
        # Declaring itself is a requirement it satisfies.
        Vocabulary([Declaration(name, label=name, delegatable=True, requires=(missing,))])
        return
    with pytest.raises(ImproperlyConfigured, match="which is not declared"):
        Vocabulary([Declaration(name, label=name, delegatable=True, requires=(missing,))])


SEGMENT = st.text(st.characters(min_codepoint=97, max_codepoint=122) | st.just(":"), max_size=6)


# Three nonempty segments drawn on their own: a random list of segments is seldom one.
@given(
    segments=st.lists(SEGMENT, min_size=1, max_size=5)
    | st.lists(SEGMENT.filter(lambda part: part and ":" not in part), min_size=3, max_size=3)
)
def test_a_name_is_three_nonempty_segments_or_nothing(segments):
    name = ":".join(segments)
    parts = name.split(":")
    if len(parts) == 3 and all(parts):
        assert Declaration(name, label="", delegatable=False) == name
    else:
        with pytest.raises(ValueError, match="is not where:action:what"):
            Declaration(name, label="", delegatable=False)


def test_the_project_vocabulary_holds_its_own_requirements():
    for declaration in VOCABULARY.by_name.values():
        assert set(declaration.requires) <= set(VOCABULARY.by_name)
