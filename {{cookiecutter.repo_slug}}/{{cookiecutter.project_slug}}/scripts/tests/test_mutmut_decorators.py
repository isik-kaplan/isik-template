"""What the decorator patch changes, and the things it must not.

Every case is a small source string put through mutmut's own generator, because the thing being
tested is what that generator emits - a test that asserted on our wrapper instead would pass while
mutmut rearranged the code underneath it.
"""

import libcst as cst
import pytest
from mutmut.__main__ import mutate_file_contents
from mutmut.mutation import file_mutation

from scripts import mutmut_decorators


@pytest.fixture
def as_it_was():
    """Whatever this process had, put back afterwards.

    Not always stock: inside mutmut's own tree the patch is installed before anything runs, so a test
    that turns it off has to put it back rather than assume it started off. Restored by assignment
    rather than by asking which case this is, so there is no arm of that question left unrun.
    """
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
    """Stock mutmut, so "what it does without this" can be asserted from inside the tree too."""
    mutmut_decorators.uninstall()


def mutants(source):
    return mutate_file_contents("probe.py", source).mutant_names


def bodies(source):
    """Every function in the generated module, keyed by name, with the name and decorators removed so
    a copy compares equal to the original it was made from."""
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
    """The state this exists to change, asserted rather than assumed."""
    assert mutants(DECORATED) == []


def test_a_decorated_function_is_mutated_once_installed(patched):
    assert mutants(DECORATED)


def test_the_decorators_stay_on_the_trampoline_alone(patched):
    """The whole mechanism: a copy carrying `@shared_task` would register a task of its own."""
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
    """A mutation inside a decorator has nothing to apply to once the copies are undecorated, so
    without dropping those the generator emits twins that no test can ever kill.

    Mutants only. The trampoline carries the original's body too, and legitimately so."""
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
    """A descriptor hands the wrapper something that is not a function; a memoizer caches the
    dispatch, so every mutant after the first is answered from the original's cached value."""
    source = f"""
class A:
    {decorator}
    def held(self):
        return 1 + 2
"""

    assert mutants(source) == []


def test_a_plain_method_beside_one_of_those_is_still_mutated(patched):
    """The other half: the skip is per function, not per file."""
    source = """
class A:
    @property
    def held(self):
        return 1 + 2

    def free(self):
        return 3 + 4
"""

    assert all("free" in name for name in mutants(source))


# `block` on the `def` line, which is the spelling that suppresses a whole function - a bare
# `# pragma: no mutate` there suppresses nothing, in stock mutmut as much as here.
PRAGMA_ON_A_DECORATED_FUNCTION = """
from celery import shared_task


@shared_task(name="probe")
def work(left, right):  # pragma: no mutate block
    return left + right
"""


def test_a_pragma_on_a_decorated_function_is_still_honoured(patched):
    """The rule a naive patch loses: it is read off the node's own position, and a decorator-stripped
    copy carries none - so asking again about the copy silently un-ignores the function."""
    assert mutants(PRAGMA_ON_A_DECORATED_FUNCTION) == []


def test_that_pragma_is_the_only_reason_it_was_skipped(patched):
    """Without it the same function is mutated, so the test above is about the pragma rather than
    about something else refusing the file."""
    assert mutants(PRAGMA_ON_A_DECORATED_FUNCTION.replace("  # pragma: no mutate block", ""))


CLASSMETHOD = """
class A:
    @classmethod
    def made(cls, value):
        return value + 1
"""


def test_a_classmethod_copy_keeps_the_decorator_that_binds_it(patched):
    """mutmut binds these by telling the trampoline `is_classmethod`, which only works while the copy
    is still a classmethod - without the decorator it is called with no `cls` at all and raises on
    import."""
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
    """`@makes_exemption` records an exemption where the marked function was called; a copy without it
    would record each one inside itself, since the copy is what the trampoline runs."""
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
    """The failure this exists to stop is a TypeError at import, so the generated module is run."""
    namespace = {}
    exec(mutate_file_contents("probe.py", CLASSMETHOD).code, namespace)  # noqa: S102 - the thing under test

    assert namespace["A"].made(1) == 2


def test_a_classmethod_wearing_anything_else_is_left_alone(patched):
    """`is_classmethod` is only set when it is the sole decorator, so mutmut would bind this wrongly.
    Skipped rather than bound wrongly."""
    source = """
class A:
    @classmethod
    @staticmethod
    def made(cls, value):
        return value + 1
"""

    assert mutants(source) == []


def test_an_undecorated_function_is_untouched_by_any_of_this(as_it_was):
    """Against stock mutmut rather than against itself: comparing one patched run to another says only
    that generation is deterministic."""
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
    """The other half of the state this exists to change: a decorator on the class, not the method,
    still blanks out every method inside it in stock mutmut."""
    assert mutants(DECORATED_CLASS) == []


def test_a_decorated_classs_methods_are_mutated_once_installed(patched):
    assert mutants(DECORATED_CLASS)


def test_a_decorated_classs_own_decorator_is_kept_and_never_duplicated(patched):
    """Nothing about the class itself is ever copied - only its methods get trampolines - so the
    class decorator has to appear on the class exactly once in the generated module, same as it did
    in the source."""
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
    """The failure this exists to stop is an exception on import - `track_events()` above only ever
    hands back the same class it was given, so this also proves the class decorator still runs."""
    namespace = {}
    exec(mutate_file_contents("probe.py", DECORATED_CLASS).code, namespace)  # noqa: S102 - the thing under test

    assert namespace["Model"]().save(1) == 2


def test_a_pragma_on_a_method_of_a_decorated_class_is_still_honoured(patched):
    """The same rule as for a decorated function, proven for the class case: a decorator-stripped
    copy of the class carries no position of its own for the pragma rule to be asked about again."""
    source = DECORATED_CLASS.replace(
        "    def save(self, value):",
        "    def save(self, value):  # pragma: no mutate block",
    )

    assert all("delete" in name for name in mutants(source))


def test_an_undecorated_class_is_untouched_by_any_of_this(as_it_was):
    """Against stock mutmut rather than against itself: comparing one patched run to another says only
    that generation is deterministic."""
    source = "class A:\n    def held(self):\n        return 1 + 2\n"

    mutmut_decorators.uninstall()
    stock = mutants(source)
    mutmut_decorators.install()

    assert stock, "stock mutmut generated nothing, so this proves nothing"
    assert mutants(source) == stock


def test_taking_it_off_puts_mutmut_back(as_it_was):
    """The round trip the fixtures rely on, and what makes a `without it` assertion possible from
    inside a tree where it is already on."""
    mutmut_decorators.uninstall()
    stock = file_mutation.function_trampoline_arrangement

    mutmut_decorators.install()
    wrapped = file_mutation.function_trampoline_arrangement
    mutmut_decorators.uninstall()

    assert wrapped is not stock
    assert file_mutation.function_trampoline_arrangement is stock
    assert mutants(DECORATED) == []


def test_taking_it_off_when_it_was_never_on_changes_nothing(unpatched):
    """Called by a fixture that cannot know which state it inherited, so it has to be safe either
    way - and wrapping stock mutmut in its own originals would be silent."""
    stock = file_mutation.function_trampoline_arrangement

    mutmut_decorators.uninstall()

    assert file_mutation.function_trampoline_arrangement is stock
    assert not mutmut_decorators.is_installed()


def test_installing_twice_does_not_wrap_twice(patched):
    """Each install wraps what it finds, so a second one over the first would strip the decorators of
    a trampoline that is itself already a wrapper."""
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
    """Named directly, because the generator only ever shows the ones this answers True for by their
    absence - and an absence is what a wrong answer here looks like too."""
    decorator = cst.parse_expression(source)

    assert mutmut_decorators.defeats_a_trampoline(decorator) is defeated
