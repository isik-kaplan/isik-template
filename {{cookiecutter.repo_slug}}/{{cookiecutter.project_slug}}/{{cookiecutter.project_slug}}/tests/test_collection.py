"""The conftest hook dropping a test the filesystem listed twice."""

from types import SimpleNamespace

import conftest


def test_a_node_id_collected_twice_is_kept_once():
    first, second, repeat = (SimpleNamespace(nodeid=nodeid) for nodeid in ("a::one", "b::two", "a::one"))
    items = [first, second, repeat]

    conftest.pytest_collection_modifyitems(items)

    assert items == [first, second]


def test_a_collection_with_nothing_repeated_is_left_alone():
    items = [SimpleNamespace(nodeid="a::one"), SimpleNamespace(nodeid="b::two")]
    unchanged = list(items)

    conftest.pytest_collection_modifyitems(items)

    assert items == unchanged
