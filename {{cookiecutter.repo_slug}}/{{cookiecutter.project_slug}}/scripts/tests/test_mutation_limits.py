"""That mutmut's wall clock and the kernel's CPU limit stay told apart."""

import signal

import pytest
from mutmut import __main__ as mutmut_main
from mutmut.threading import timeout as timeout_module

from scripts import mutation_limits


@pytest.fixture(autouse=True)
def restored():
    """`install` edits mutmut's own globals."""
    held = (timeout_module.signal, mutmut_main.register_timeout)
    yield
    timeout_module.signal, mutmut_main.register_timeout = held


@pytest.fixture
def seen(monkeypatch):
    monkeypatch.setattr(mutation_limits, "process_time", lambda: 7.0)
    calls = []
    mutmut_main.register_timeout = lambda pid, timeout_s: calls.append((pid, timeout_s)) or "registered"
    return calls


def test_the_wall_outlasts_the_cpu_budget_the_child_is_given(monkeypatch):
    monkeypatch.setattr(mutation_limits, "process_time", lambda: 7.0)

    assert mutation_limits.wall_limit(100) == 100 * 2 + 7.0 + 30


def test_the_wall_clears_the_second_mutmut_leaves_before_sigkill():
    assert mutation_limits.WALL_GRACE > 1


def test_the_wall_leaves_sigxcpu_to_the_kernel():
    mutation_limits.install()

    assert timeout_module.signal.SIGXCPU == signal.SIGTERM


def test_the_wall_mutmut_computed_is_widened_on_its_way_through(seen):
    mutation_limits.install()

    assert mutmut_main.register_timeout(pid=4321, timeout_s=100) == "registered"
    assert seen == [(4321, 237.0)]


def test_installing_twice_does_not_widen_the_wall_twice(seen):
    mutation_limits.install()
    mutation_limits.install()

    mutmut_main.register_timeout(pid=1, timeout_s=100)

    assert seen == [(1, 237.0)]


def test_mutmuts_own_vocabulary_is_left_alone():
    """Its `Stat` is a fixed dataclass, so a new word there fails the run; `mutation_cache` restates instead."""
    mutation_limits.install()

    assert mutmut_main.status_by_exit_code[-signal.SIGXCPU] == "timeout"
