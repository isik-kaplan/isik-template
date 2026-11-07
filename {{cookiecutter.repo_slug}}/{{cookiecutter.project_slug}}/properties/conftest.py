"""The property suite's own settings, kept out of the example suite's conftest.

One profile, 25 examples, for development and CI alike: a counterexample that only a deeper run
finds is one the gate never had, and nobody can reproduce it locally.
"""

import os
from pathlib import Path

import pytest
from hypothesis import HealthCheck, Verbosity, settings


COMMON = {
    # A function-scoped fixture is built once per test, not once per example. An example must set up
    # absolute state, never change things relative to what the previous example left.
    "suppress_health_check": [HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
    # A loaded runner times one example past the default and fails a test that found nothing.
    "deadline": None,
    "max_examples": 25,
}

settings.register_profile("properties", **COMMON)
# Mutation reruns every test per mutant, so each run has to draw the same examples.
settings.register_profile("mutation", **COMMON, derandomize=True, verbosity=Verbosity.quiet)
settings.load_profile("mutation" if os.environ.get("MUTANT_UNDER_TEST") else "properties")

HERE = Path(__file__).parent


@pytest.hookimpl(tryfirst=True)
def pytest_collection_modifyitems(items):
    # Before `-m` deselects anything: an enumerated sweep here is a property too, @given or not.
    for item in items:
        if HERE in item.path.parents:
            item.add_marker(pytest.mark.hypothesis)
