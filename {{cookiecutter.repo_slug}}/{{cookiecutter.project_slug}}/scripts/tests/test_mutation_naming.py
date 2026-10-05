"""The naming patch, and the upstream function it wraps.

Upstream's own arrangement is loaded fresh rather than read off mutmut: inside a mutants tree the
patch is already installed, and the module attribute is the wrapped one there.
"""

import importlib.util
import re

import libcst as cst
import pytest
from mutmut.__main__ import mutate_file_contents
from mutmut.mutation import file_mutation

from scripts import mutation_naming, mutmut_decorators


def _fresh_upstream():
    spec = importlib.util.find_spec("mutmut.mutation.file_mutation")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.function_trampoline_arrangement


@pytest.fixture(scope="module")
def upstream():
    return _fresh_upstream()


@pytest.fixture
def as_it_was():
    """Whatever this process had, put back afterwards - inside the tree that is the patched one."""
    saved = (
        file_mutation.MutationVisitor._skip_node_and_children,
        file_mutation.function_trampoline_arrangement,
        getattr(file_mutation, "_stock_mutmut", None),
    )
    yield
    (
        file_mutation.MutationVisitor._skip_node_and_children,
        file_mutation.function_trampoline_arrangement,
        file_mutation._stock_mutmut,
    ) = saved


def _mutation(original, mutated):
    class Stub:
        original_node = cst.parse_expression(original)
        mutated_node = cst.parse_expression(mutated)

    return Stub()


def _render(groups):
    code = cst.Module([]).code_for_node
    return "\n".join(code(node) for group in groups for node in group)


def test_the_name_is_the_change_rather_than_a_position():
    first = mutation_naming.identity(_mutation("a > b", "a >= b"))
    again = mutation_naming.identity(_mutation("a > b", "a >= b"))
    other = mutation_naming.identity(_mutation("a > b", "a < b"))

    assert first == again
    assert first != other
    assert re.fullmatch(r"[0-9a-f]{12}", first)


def test_the_same_change_twice_in_one_function_is_still_two_names():
    """A shared name would leave the second mutant unreachable through the trampoline."""
    names = list(mutation_naming.identities([_mutation('"."', '"X"'), _mutation('"."', '"X"'), _mutation("a", "b")]))

    assert len(set(names)) == 3
    assert names[1] == f"{names[0]}_1"
    assert "_" not in names[2]


def test_a_name_still_reads_as_a_mutant_to_everything_that_parses_one():
    from mutmut.utils.format_utils import is_mutated_method_name

    name = "xǁAccountAdapterǁsend_mail__mutmut__bb2eac90740e"

    assert is_mutated_method_name(name)
    assert name.rpartition("__mutmut_")[0] == "xǁAccountAdapterǁsend_mail"
    assert name.partition("__mutmut_")[0] == "xǁAccountAdapterǁsend_mail"


def test_upstream_returns_one_name_per_mutant_in_the_order_it_was_given_them(upstream):
    """The whole contract the renaming rests on: it pairs upstream's names with its own by position."""
    function = cst.parse_module("def add(a, b):\n    return a + b\n").body[0]

    _, methods, _, names = upstream(function, [_mutation("a + b", "a - b"), _mutation("a + b", "b + a")], None)

    assert names == ["x_add__mutmut_1", "x_add__mutmut_2"]
    assert [node.name.value for node in methods] == ["add", "x_add__mutmut_orig", *names]


@pytest.mark.parametrize(
    "source,class_name,changes",
    [
        ("def add(a, b):\n    return a + b\n", None, [("a + b", "a - b"), ("a + b", "b + a")]),
        ("class T:\n    @classmethod\n    def go(cls, a):\n        return a + 1\n", "T", [("a + 1", "a - 1")]),
        ("class T:\n    @staticmethod\n    def go(a):\n        return a + 1\n", "T", [("1", "2")]),
        ("async def go(a):\n    return a * 2\n", None, [("a * 2", "a / 2")]),
        ('def located(s):\n    return s.split(".")[0] + "."\n', None, [('"."', '"X"'), ('"."', '"X"')]),
    ],
)
def test_the_arrangement_is_upstreams_with_nothing_but_the_names_changed(upstream, source, class_name, changes):
    module = cst.parse_module(source)
    function = module.body[0].body.body[0] if class_name else module.body[0]
    mutants = [_mutation(before, after) for before, after in changes]

    theirs = upstream(function, mutants, class_name)
    ours = mutation_naming.renamed(upstream, function, mutants, class_name)

    expected = _render(theirs[:3])
    for positional, renamed in zip(theirs[3], ours[3], strict=True):
        expected = expected.replace(positional, renamed)
    assert _render(ours[:3]) == expected
    assert all("__mutmut__" in name for name in ours[3])


def test_the_dispatch_dict_is_keyed_on_the_names_the_mutants_now_carry(upstream):
    function = cst.parse_module("def add(a, b):\n    return a + b\n").body[0]

    _, _, assignment, names = mutation_naming.renamed(upstream, function, [_mutation("a + b", "a - b")], None)
    rendered = "".join(cst.Module([]).code_for_node(node) for node in assignment)

    assert names[0] in rendered
    assert "x_add__mutmut_1'" not in rendered


@pytest.mark.parametrize(
    "path,module",
    [
        ("apps/users/adapters.py", "apps.users.adapters"),
        ("apps/users/models/__init__.py", "apps.users.models"),
        ("apps/__init__/thing.py", "apps.__init__.thing"),
    ],
)
def test_a_package_init_is_named_as_the_package_itself(path, module):
    """mutmut files an `__init__.py`'s mutants under the package; a name carrying `.__init__` is
    one no verdict is ever recorded against."""
    assert mutation_naming.module_of(path) == module


def test_applying_is_idempotent_and_composes_with_the_decorator_patch(as_it_was):
    """Both entry-point orders - naming first or decorators first - generate the same hashed names,
    and a decorated function's copies still carry none of its decorators."""
    source = "@receiver\ndef handle(a):\n    return a + 1\n"
    found = []
    orders = ((mutation_naming.apply, mutmut_decorators.install), (mutmut_decorators.install, mutation_naming.apply))
    for first, second in orders:
        mutmut_decorators.uninstall()
        file_mutation.function_trampoline_arrangement = _fresh_upstream()
        first()
        second()
        mutation_naming.apply()
        result = mutate_file_contents("probe.py", source)
        assert result.code.count("@receiver") == 1
        found.append(sorted(result.mutant_names))

    assert found[0] == found[1]
    assert found[0] and all(re.fullmatch(r"x_handle__mutmut__[0-9a-f]{12}", name) for name in found[0])
