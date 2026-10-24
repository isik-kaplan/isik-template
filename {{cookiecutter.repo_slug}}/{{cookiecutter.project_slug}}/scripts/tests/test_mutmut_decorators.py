"""The decorator patch, asserted on what mutmut's own generator emits rather than on the wrapper."""

import libcst as cst
import pytest
from mutmut.__main__ import mutate_file_contents
from mutmut.mutation import file_mutation

from scripts import mutmut_decorators


@pytest.fixture
def as_it_was():
    """Restore whatever this process had: inside mutmut's tree the patch starts installed."""
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


@pytest.fixture
def patched(as_it_was):
    mutmut_decorators.install()


@pytest.fixture
def unpatched(as_it_was):
    mutmut_decorators.uninstall()


def mutants(source):
    return mutate_file_contents("probe.py", source).mutant_names


def bodies(source):
    """Each generated function by name, minus name and decorators, so a copy equals its original."""
    module = cst.parse_module(mutate_file_contents("probe.py", source).code)
    found = {}

    class Collect(cst.CSTVisitor):
        def visit_FunctionDef(self, node):
            found[node.name.value] = module.code_for_node(node.with_changes(name=cst.Name("X"), decorators=[]))

    module.visit(Collect())
    return found


DECORATED = """
from celery import shared_task


@shared_task(name="probe")
def work(left, right):
    return left + right
"""


def test_a_decorated_function_has_no_mutants_without_it(unpatched):
    assert mutants(DECORATED) == []


def test_a_decorated_function_is_mutated_once_installed(patched):
    assert mutants(DECORATED)


def test_the_decorators_stay_on_the_trampoline_alone(patched):
    """A copy carrying `@shared_task` would register a task of its own."""
    module = cst.parse_module(mutate_file_contents("probe.py", DECORATED).code)
    decorated = {}

    class Collect(cst.CSTVisitor):
        def visit_FunctionDef(self, node):
            decorated[node.name.value] = [module.code_for_node(d) for d in node.decorators]

    module.visit(Collect())

    assert any("shared_task" in d for d in decorated["work"]), "the trampoline lost its decorator"
    copies = [name for name in decorated if name != "work"]
    assert copies, "nothing was copied, so this proves nothing"
    assert all(decorated[name] == [] for name in copies)


def test_no_mutant_is_an_identical_copy_of_the_original(patched):
    """A mutation inside a decorator would be an unkillable twin. Mutants only: the trampoline legitimately matches."""
    found = bodies(DECORATED)
    original = found["x_work__mutmut_orig"]
    named = mutants(DECORATED)

    assert named, "nothing was generated, so this proves nothing"
    assert [name for name in named if found[name] == original] == []


@pytest.mark.parametrize(
    "decorator",
    ["@property", "@cache", "@functools.cache", "@lru_cache(maxsize=None)", "@thing.setter"],
)
def test_a_decorator_a_trampoline_cannot_sit_under_is_still_skipped(patched, decorator):
    source = f"""
class A:
    {decorator}
    def held(self):
        return 1 + 2
"""

    assert mutants(source) == []


def test_a_plain_method_beside_one_of_those_is_still_mutated(patched):
    source = """
class A:
    @property
    def held(self):
        return 1 + 2

    def free(self):
        return 3 + 4
"""

    assert all("free" in name for name in mutants(source))


# Only `... block` on the `def` line suppresses a whole function; the bare pragma there does nothing.
PRAGMA_ON_A_DECORATED_FUNCTION = """
from celery import shared_task


@shared_task(name="probe")
def work(left, right):  # pragma: no mutate block
    return left + right
"""


def test_a_pragma_on_a_decorated_function_is_still_honoured(patched):
    """The pragma is read off the node's position, which a stripped copy lacks."""
    assert mutants(PRAGMA_ON_A_DECORATED_FUNCTION) == []


def test_that_pragma_is_the_only_reason_it_was_skipped(patched):
    assert mutants(PRAGMA_ON_A_DECORATED_FUNCTION.replace("  # pragma: no mutate block", ""))


CLASSMETHOD = """
class A:
    @classmethod
    def made(cls, value):
        return value + 1
"""


def test_a_classmethod_copy_keeps_the_decorator_that_binds_it(patched):
    """mutmut's `is_classmethod` binding needs the copy to still be a classmethod."""
    module = cst.parse_module(mutate_file_contents("probe.py", CLASSMETHOD).code)
    decorated = {}

    class Collect(cst.CSTVisitor):
        def visit_FunctionDef(self, node):
            decorated[node.name.value] = [module.code_for_node(d).strip() for d in node.decorators]

    module.visit(Collect())
    copies = [name for name in decorated if name != "made"]

    assert copies, "nothing was copied, so this proves nothing"
    assert all("@classmethod" in decorated[name] for name in copies)


def test_every_copy_keeps_a_decorator_that_only_marks_it(patched):
    """The copy is what runs, so it must carry the mark."""
    source = """
@makes_exemption(Reason)
@shared_task
def work(left, right):
    return left + right
"""
    module = cst.parse_module(mutate_file_contents("probe.py", source).code)
    decorated = {}

    class Collect(cst.CSTVisitor):
        def visit_FunctionDef(self, node):
            decorated[node.name.value] = [module.code_for_node(d).strip() for d in node.decorators]

    module.visit(Collect())
    copies = [name for name in decorated if name != "work"]

    assert copies, "nothing was copied, so this proves nothing"
    assert all(decorated[name] == ["@makes_exemption(Reason)"] for name in copies)


def test_the_mutants_of_a_classmethod_can_actually_be_called(patched):
    """The failure is a TypeError at import, so the generated module is run."""
    namespace = {}
    exec(mutate_file_contents("probe.py", CLASSMETHOD).code, namespace)  # noqa: S102 - the thing under test

    assert namespace["A"].made(1) == 2


def test_a_classmethod_wearing_anything_else_is_left_alone(patched):
    """`is_classmethod` is set only for a sole decorator, so this would be bound wrongly."""
    source = """
class A:
    @classmethod
    @staticmethod
    def made(cls, value):
        return value + 1
"""

    assert mutants(source) == []


def test_an_undecorated_function_is_untouched_by_any_of_this(as_it_was):
    """Against stock mutmut: patched vs patched only proves determinism."""
    source = "def work(left, right):\n    return left + right\n"

    mutmut_decorators.uninstall()
    stock = mutants(source)
    mutmut_decorators.install()

    assert stock, "stock mutmut generated nothing, so this proves nothing"
    assert mutants(source) == stock


DECORATED_CLASS = """
def track_events():
    def wrap(cls):
        return cls
    return wrap


@track_events()
class Model:
    def save(self, value):
        return value + 1

    def delete(self):
        return None
"""


def test_a_decorated_class_has_no_mutants_for_its_methods_without_it(unpatched):
    assert mutants(DECORATED_CLASS) == []


def test_a_decorated_classs_methods_are_mutated_once_installed(patched):
    assert mutants(DECORATED_CLASS)


def test_a_decorated_classs_own_decorator_is_kept_and_never_duplicated(patched):
    module = cst.parse_module(mutate_file_contents("probe.py", DECORATED_CLASS).code)
    found = []

    class Collect(cst.CSTVisitor):
        def visit_ClassDef(self, node):
            if node.name.value == "Model":
                found.append([module.code_for_node(d) for d in node.decorators])

    module.visit(Collect())

    assert len(found) == 1, "the class itself was copied, which should never happen"
    assert any("track_events" in d for d in found[0])


def test_the_mutants_of_a_decorated_classs_methods_can_actually_be_called(patched):
    """Running the module also proves the class decorator still runs."""
    namespace = {}
    exec(mutate_file_contents("probe.py", DECORATED_CLASS).code, namespace)  # noqa: S102 - the thing under test

    assert namespace["Model"]().save(1) == 2


def test_a_pragma_on_a_method_of_a_decorated_class_is_still_honoured(patched):
    source = DECORATED_CLASS.replace(
        "    def save(self, value):",
        "    def save(self, value):  # pragma: no mutate block",
    )

    assert all("delete" in name for name in mutants(source))


def test_an_undecorated_class_is_untouched_by_any_of_this(as_it_was):
    """Against stock mutmut: patched vs patched only proves determinism."""
    source = "class A:\n    def held(self):\n        return 1 + 2\n"

    mutmut_decorators.uninstall()
    stock = mutants(source)
    mutmut_decorators.install()

    assert stock, "stock mutmut generated nothing, so this proves nothing"
    assert mutants(source) == stock


def test_taking_it_off_puts_mutmut_back(as_it_was):
    mutmut_decorators.uninstall()
    stock = file_mutation.function_trampoline_arrangement

    mutmut_decorators.install()
    wrapped = file_mutation.function_trampoline_arrangement
    mutmut_decorators.uninstall()

    assert wrapped is not stock
    assert file_mutation.function_trampoline_arrangement is stock
    assert mutants(DECORATED) == []


def test_taking_it_off_when_it_was_never_on_changes_nothing(unpatched):
    stock = file_mutation.function_trampoline_arrangement

    mutmut_decorators.uninstall()

    assert file_mutation.function_trampoline_arrangement is stock
    assert not mutmut_decorators.is_installed()


def test_installing_twice_does_not_wrap_twice(patched):
    once = file_mutation.function_trampoline_arrangement

    mutmut_decorators.install()

    assert file_mutation.function_trampoline_arrangement is once


@pytest.mark.parametrize(
    "source, defeated",
    [
        ("property", True),
        ("cache", True),
        ("thing.setter", True),
        ("thing.register", False),
        ("shared_task", False),
        ("shared_task(name='x')", False),
        ("1 + 1", False),
    ],
)
def test_which_decorators_defeat_a_trampoline(source, defeated):
    """Asserted directly: in generated output a wrong answer is just an absence."""
    decorator = cst.parse_expression(source)

    assert mutmut_decorators.defeats_a_trampoline(decorator) is defeated
