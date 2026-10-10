"""The layout check: what it refuses, and what it deliberately does not.

Driven against written files rather than the live tree, so a case this is meant to catch is tested
by being present rather than by the repo happening to contain one.
"""

import pytest

from scripts import layout_check


@pytest.fixture
def tree(tmp_path, monkeypatch):
    monkeypatch.setattr(layout_check, "ROOT", tmp_path)
    monkeypatch.setattr(layout_check, "OURS", ("apps",))
    monkeypatch.setattr(layout_check, "EXCEPTIONS", {})

    def write(relative, source):
        path = tmp_path / "apps" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source)
        return list(layout_check.complaints())

    return write


TWO_SERIALIZERS = "class ASerializer: pass\nclass BSerializer: pass\n"


def test_two_serializers_in_one_module_are_refused(tree):
    found = tree("shop/api/serializers.py", TWO_SERIALIZERS)

    assert found == [("apps/shop/api/serializers.py", "folder", ["ASerializer", "BSerializer"])]


def test_two_serializers_in_one_file_of_a_package_are_refused(tree):
    found = tree("shop/api/serializers/order.py", TWO_SERIALIZERS)

    assert found == [("apps/shop/api/serializers/order.py", "file", ["ASerializer", "BSerializer"])]


def test_a_package_init_is_judged_by_its_folder(tree):
    found = tree("shop/api/serializers/__init__.py", TWO_SERIALIZERS)

    assert found == [("apps/shop/api/serializers/__init__.py", "file", ["ASerializer", "BSerializer"])]


def test_a_module_named_for_no_kind_is_not_judged(tree):
    assert tree("shop/utils.py", TWO_SERIALIZERS + "def helper(): pass\n") == []


def test_a_model_with_its_queryset_and_manager_is_one_concept(tree):
    """The reason the check reads names rather than counting classes."""
    source = "class ThingQuerySet: pass\nclass ThingManager: pass\nclass Thing: pass\n"

    assert tree("shop/models/thing.py", source) == []


def test_two_models_in_one_file_are_refused(tree):
    found = tree("shop/models/thing.py", "class Thing: pass\nclass Other: pass\n")

    assert found == [("apps/shop/models/thing.py", "file", ["Thing", "Other"])]


def test_a_function_beside_a_model_is_a_stranger(tree):
    found = tree("shop/models/thing.py", "class Thing: pass\n\n\ndef upload_to(instance, name): return name\n")

    assert found == [("apps/shop/models/thing.py", "stranger", ["upload_to"])]


def test_tests_and_migrations_are_not_this_check_to_judge(tree):
    assert tree("shop/tests/serializers.py", TWO_SERIALIZERS) == []
    assert tree("shop/migrations/serializers.py", TWO_SERIALIZERS) == []


def test_a_helper_in_a_serializers_file_is_refused(tree):
    """A helper does not become a serializer by sitting in a file full of them."""
    source = "class OrderSerializer: pass\n\n\ndef _resolve_users(memberships): return []\n"

    found = tree("shop/api/serializers/order.py", source)

    assert found == [("apps/shop/api/serializers/order.py", "stranger", ["_resolve_users"])]


def test_an_async_helper_is_a_stranger_too(tree):
    source = "class OrderViewSet: pass\n\n\nasync def fetch(): return None\n"

    assert tree("shop/api/viewsets/order.py", source) == [("apps/shop/api/viewsets/order.py", "stranger", ["fetch"])]


def test_a_class_of_another_kind_in_a_governed_folder_is_refused(tree):
    found = tree("shop/api/viewsets/order.py", "class OrderViewSet: pass\n\n\nclass StrayHelper: pass\n")

    assert found == [("apps/shop/api/viewsets/order.py", "stranger", ["StrayHelper"])]


def test_a_count_and_a_stranger_are_both_reported(tree):
    found = tree("shop/api/serializers.py", TWO_SERIALIZERS + "def helper(): pass\n")

    assert [where for _, where, _ in found] == ["folder", "stranger"]


def test_a_factory_named_for_its_file_is_what_that_file_declares(tree):
    assert tree("shop/api/fields/inner_field.py", "def inner_field(**kwargs): return None\n") == []


def test_a_class_named_for_its_file_is_too(tree):
    """`history.py` holding `HistoryMixin`: a viewset mixin is not a `*ViewSet`, and the file is
    named for it, which is the same rule read the other way round."""
    assert tree("shop/api/viewsets/history.py", "class HistoryMixin: pass\n") == []


def test_a_multi_word_file_name_is_read_as_the_class_would_spell_it(tree):
    assert tree("shop/middleware/health_check.py", "class HealthCheckGate: pass\n") == []


def test_a_permission_is_one_by_what_it_inherits_rather_than_what_it_reads_as(tree):
    """DRF permissions read as assertions - `IsOwner` - so the name alone would make every one of
    them a stranger in its own folder."""
    assert tree("shop/api/permissions/owner_only.py", "class IsOwner(BasePermission): pass\n") == []


def test_a_base_is_read_through_the_module_it_is_reached_by(tree):
    assert tree("shop/api/serializers/order.py", "class Order(serializers.Serializer): pass\n") == []


def test_a_base_that_names_nothing_readable_is_passed_over(tree):
    """A subscripted base names nothing this can read, so the class is judged on its own name."""
    assert tree("shop/api/serializers/order.py", "class OrderSerializer(Generic[T]): pass\n") == []
    found = tree("shop/api/serializers/line.py", "class Stray(Generic[T]): pass\n")
    assert found == [("apps/shop/api/serializers/line.py", "stranger", ["Stray"])]


def test_the_utility_package_may_hold_helpers_under_any_name(tree):
    source = "class HistoryFieldsMixin: pass\n\n\ndef rows_for(instance): return []\n"

    assert tree("common/api/serializers/history.py", source) == []


def test_the_utility_package_is_still_held_to_one_per_file(tree):
    found = tree("common/api/serializers.py", TWO_SERIALIZERS)

    assert found == [("apps/common/api/serializers.py", "folder", ["ASerializer", "BSerializer"])]


def test_an_exception_excuses_its_file(tree, monkeypatch):
    monkeypatch.setattr(layout_check, "EXCEPTIONS", {"apps/shop/api/serializers.py": "a reason"})

    assert tree("shop/api/serializers.py", TWO_SERIALIZERS) == []


def test_an_exception_that_excuses_nothing_is_stale(tree, monkeypatch):
    """An escape hatch nothing re-checks outlives what it was written for."""
    monkeypatch.setattr(layout_check, "EXCEPTIONS", {"apps/shop/api/serializers.py": "a reason"})

    assert tree("shop/api/serializers.py", "class ASerializer: pass\n") == [
        ("apps/shop/api/serializers.py", "stale", [])
    ]


def test_an_exception_for_a_file_that_is_gone_is_stale(tree, monkeypatch):
    monkeypatch.setattr(layout_check, "EXCEPTIONS", {"apps/gone.py": "a reason"})

    assert tree("shop/utils.py", "") == [("apps/gone.py", "stale", [])]


def test_it_names_the_file_the_classes_and_the_way_out(tree, capsys):
    tree("shop/api/serializers.py", TWO_SERIALIZERS)

    assert layout_check.main() == 1
    assert capsys.readouterr().err == (
        "layout-check: apps/shop/api/serializers.py holds 2: ASerializer, BSerializer.\n"
        "              Make it a folder with one of them per file.\n"
        "              A deliberate exception goes in EXCEPTIONS in this script, with its reason.\n"
    )


def test_a_file_inside_a_package_is_told_to_split(tree, capsys):
    tree("shop/api/serializers/order.py", TWO_SERIALIZERS)

    assert layout_check.main() == 1
    assert capsys.readouterr().err == (
        "layout-check: apps/shop/api/serializers/order.py holds 2: ASerializer, BSerializer.\n"
        "              One per file - give the others their own.\n"
        "              A deliberate exception goes in EXCEPTIONS in this script, with its reason.\n"
    )


def test_it_says_what_to_do_with_a_stranger(tree, capsys):
    tree("shop/api/serializers/order.py", "class OrderSerializer: pass\n\n\ndef helper(): return []\n")

    assert layout_check.main() == 1
    assert capsys.readouterr().err == (
        "layout-check: apps/shop/api/serializers/order.py also holds helper.\n"
        "              A file holds what its name declares - move these onto the model, or into a utility module.\n"
        "              A deliberate exception goes in EXCEPTIONS in this script, with its reason.\n"
    )


def test_it_says_what_to_do_with_a_stale_exception(tree, monkeypatch, capsys):
    monkeypatch.setattr(layout_check, "EXCEPTIONS", {"apps/gone.py": "a reason"})
    tree("shop/utils.py", "")

    assert layout_check.main() == 1
    assert capsys.readouterr().err == (
        "layout-check: apps/gone.py is in EXCEPTIONS, and passes without it.\n"
        "              Nothing here needs excusing any more - take it out of EXCEPTIONS.\n"
        "              A deliberate exception goes in EXCEPTIONS in this script, with its reason.\n"
    )


def test_two_offending_files_get_their_own_advice_and_one_way_out(tree, capsys):
    tree("shop/api/serializers.py", TWO_SERIALIZERS)
    tree("shop/api/viewsets/order.py", "class OrderViewSet: pass\n\n\ndef helper(): return []\n")

    assert layout_check.main() == 1
    assert capsys.readouterr().err == (
        "layout-check: apps/shop/api/serializers.py holds 2: ASerializer, BSerializer.\n"
        "              Make it a folder with one of them per file.\n"
        "layout-check: apps/shop/api/viewsets/order.py also holds helper.\n"
        "              A file holds what its name declares - move these onto the model, or into a utility module.\n"
        "              A deliberate exception goes in EXCEPTIONS in this script, with its reason.\n"
    )


def test_a_mutated_tree_reads_the_same_as_the_real_one(tree):
    """mutmut rewrites a function into variants beside a dispatcher, and this suite runs in that tree."""
    source = (
        "def x_order__mutmut_orig(): pass\n"
        "def x_order__mutmut_1(): pass\n"
        "def order(): pass\n"
        "class OrderSerializer: pass\n"
    )

    assert tree("shop/api/serializers/order.py", source) == []


def test_a_helper_merely_starting_with_x_is_still_a_stranger(tree):
    found = tree("shop/api/serializers/order.py", "class OrderSerializer: pass\n\n\ndef x_helper(): pass\n")

    assert found == [("apps/shop/api/serializers/order.py", "stranger", ["x_helper"])]


def test_a_clean_tree_says_nothing_and_passes(tree, capsys):
    tree("shop/api/serializers.py", "class ASerializer: pass\n")

    assert layout_check.main() == 0
    assert capsys.readouterr().err == ""


def test_the_real_tree_passes():
    """The check against the project itself, so this suite fails when somebody adds a second one."""
    assert list(layout_check.complaints()) == []
