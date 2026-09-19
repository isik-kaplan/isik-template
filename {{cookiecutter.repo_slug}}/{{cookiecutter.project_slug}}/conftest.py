import os
from pathlib import Path

import pytest
from django.conf import settings as django_settings
from django.core.cache import cache
from django.db import connections


@pytest.fixture(autouse=True)
def _clear_cache():
    """allauth's rate limiter lives in the default cache, which nothing else here resets between
    tests. Invisible under the default -n auto (each worker gets its own process-local cache), but
    real: enough requests to a rate-limited view earlier in the same process silently starves a
    later test's own request of the same kind, however unrelated the two tests look."""
    cache.clear()


# Captured before any session can rewrite it: pytest-django replaces the live database name with the
# test one, and a mutation run re-imports this file mid-run in the same process.
#
# Held on the settings object rather than in a module global, because a module global is captured per
# *import* and mutmut re-imports this file once mid-run - the second import would read a name the
# first session already replaced and compose the test name on top of that instead of the real one.
if not hasattr(django_settings, "_ORIGINAL_DATABASE_NAMES"):
    django_settings._ORIGINAL_DATABASE_NAMES = {
        alias: database["NAME"] for alias, database in django_settings.DATABASES.items()
    }
_DATABASE_NAMES = django_settings._ORIGINAL_DATABASE_NAMES


def pytest_configure(config):
    """A mutation run may only reuse a database it cloned itself.

    `--reuse-db` is how a templated mutation run stops pytest-django rebuilding what it already
    cloned. The same flag without a template means every mutant in the run shares one database, and
    the fixtures each test leaves behind (a user row, a session, a queued mail) accumulate state
    nothing heals between mutants.

    Checked here rather than in a fixture: raising from a session fixture fails every test that
    wanted a database, and a suite that errors is exactly what a mutation run counts as a kill - the
    misconfiguration would score as a clean sweep instead of stopping the run.
    """
    if os.environ.get("MUTMUT_DB_TEMPLATE"):
        # Set here rather than passed as `--reuse-db`: mutmut takes pytest arguments from
        # pyproject.toml only, where the flag would also reach an ordinary run and mean the unsafe
        # thing there.
        config.option.reuse_db = True
        return
    # The one session that legitimately reuses without a template is the one building it: it seeds
    # the database the template is made from, so no template can exist yet.
    if os.environ.get("MUTMUT_TEMPLATE_BUILD"):
        return
    if config.getvalue("reuse_db") and os.environ.get("MUTMUT_DB_SUFFIX"):
        raise pytest.UsageError(
            "a mutation run (MUTMUT_DB_SUFFIX is set) passed --reuse-db without MUTMUT_DB_TEMPLATE. "
            "Build one with `python scripts/mutation_template.py build`, or drop --reuse-db and pay "
            "for a database per session."
        )


@pytest.fixture(scope="session")
def django_db_modify_db_settings(django_db_modify_db_settings_xdist_suffix):
    """A test database of its own for a mutation run, named by `MUTMUT_DB_SUFFIX`.

    mutmut runs one child process at a time (`--max-children 1`), but this still has to be safe if
    that ever changes: two children sharing one process-derived name would build and drop the same
    `test_<name>` and fail over each other rather than over the mutation, which scores as a kill and
    reads as a suite that caught something.

    The suffix has to be read here rather than baked into settings, which is imported once before
    any child forks.
    """
    suffix = os.environ.get("MUTMUT_DB_SUFFIX")
    if not suffix:
        return
    # Composed with the xdist worker rather than replacing it, so a mutation run that ever adds
    # xdist back does not hand every worker the same database.
    worker = os.environ.get("PYTEST_XDIST_WORKER")
    template = os.environ.get("MUTMUT_DB_TEMPLATE")
    for alias, name in _DATABASE_NAMES.items():
        test_name = "_".join(part for part in (f"test_{name}", suffix, worker) if part)
        django_settings.DATABASES[alias].setdefault("TEST", {})["NAME"] = test_name
        # The live connection holds its own copy of these settings, taken before any fixture runs,
        # and that copy is the one the test database is actually created from.
        connections[alias].settings_dict.setdefault("TEST", {})["NAME"] = test_name
        # Postgres truncates a longer identifier rather than refusing it, which would hand two runs
        # one database and score their collision as a kill. Refused here, where the name is built.
        if len(test_name) > 63:
            raise pytest.UsageError(
                f"the test database name {test_name!r} is {len(test_name)} characters, past "
                "Postgres's limit of 63 - shorten MUTMUT_DB_SUFFIX."
            )
        if template:
            _clone_template(template, test_name, django_settings.DATABASES[alias], name)


def _clone_template(template, into, database, maintenance_name):
    """Copy a prebuilt database instead of migrating one, for a run that names a template.

    Migrations are most of a mutant's cost and every mutant pays it; `CREATE DATABASE ... TEMPLATE`
    is a fraction of a second by comparison. This runs before pytest-django's own setup and leaves a
    database already present, which `--reuse-db` then finds rather than building - so the flag means
    "do not build" here, and every session still gets a database of its own. That is what makes it
    safe: the shared fixtures commit on purpose, and reusing one database across sessions
    accumulates state nothing heals.

    `scripts/mutation_template.py check` is what keeps this honest. A template that has drifted from
    what the migrations build measures every mutant against the wrong schema, and reports a number
    that looks exactly like a real one.
    """
    import psycopg

    connection_arguments = {
        "host": database["HOST"],
        "port": database["PORT"] or 5432,
        "user": database["USER"],
        "password": database["PASSWORD"],
        # The database this file was imported knowing, never the live one: after the first session
        # that is the test database, and once its name stops changing between sessions the connection
        # would be sitting on the database the next statement drops.
        "dbname": maintenance_name,
        "autocommit": True,
    }
    with psycopg.connect(**connection_arguments) as maintenance:
        # Postgres refuses to copy a database anything is connected to, and refuses to drop one for
        # the same reason. Both errors surface at the clone rather than at whatever held the connection.
        for target in (template, into):
            maintenance.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                (target,),
            )
        maintenance.execute(f'DROP DATABASE IF EXISTS "{into}"')
        maintenance.execute(f'CREATE DATABASE "{into}" TEMPLATE "{template}"')


# The tree's own pyproject.toml, which no test may write. Phase two runs several pytest sessions at
# once against one tree, and `Path.write_text` truncates before it writes - a read landing in that
# window returns "", which a test that round-trips the file then writes back as the original,
# emptying it for good and making every later mutant read as killed.
_PYPROJECT = Path(__file__).resolve().parent / "pyproject.toml"
MUTMUT_TABLE = "[tool.mutmut]"


@pytest.fixture(autouse=True)
def _fail_a_test_that_destroys_the_tree_configuration():
    """Catches the writer rather than the wreckage: `confirm_survivors.py` only notices once a whole
    run has been mis-scored, and by then which mutants were measured against a broken tree is
    unknowable.

    The table rather than the bytes, because mutmut writes this file itself while the tests it
    started are running - `only_mutate` appearing or going is its business, and the file ceasing to
    be a mutmut configuration at all is the damage this guards against.
    """
    yield
    assert MUTMUT_TABLE in _PYPROJECT.read_text(), (
        f"{_PYPROJECT.name} lost its {MUTMUT_TABLE} table during this test. Several sessions can "
        "share one tree in phase two, so a write here races the others' reads and can empty the "
        "file - after which every import raises and each mutant is recorded as killed. Point "
        "whatever this test writes at a copy in tmp_path instead."
    )
