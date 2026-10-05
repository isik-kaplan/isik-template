import logging
import os
import uuid
from pathlib import Path

import pytest
from django.conf import settings as django_settings
from django.core.cache import cache
from django.db import connections, transaction
from django.test import Client
from isik.django.apps.idempotency.drf import IdempotencyMixin

from apps.common.logging.emit import AUDIT_LOGGER, LOGGER
from apps.common.logging.events import PAYLOAD

from {{ cookiecutter.project_slug }}.config import CONFIG as config


@pytest.fixture(autouse=True)
def _clear_cache():
    """allauth's rate limiter lives in the default cache, which nothing else here resets between
    tests. Invisible under the default -n auto (each worker gets its own process-local cache), but
    real: enough requests to a rate-limited view earlier in the same process silently starves a
    later test's own request of the same kind, however unrelated the two tests look."""
    cache.clear()


@pytest.fixture(autouse=True)
def _commit_callbacks_run_where_a_request_would_commit(request, monkeypatch):
    """`on_commit` runs immediately, because pytest-django's transaction never commits.

    Mail and task dispatch defer to commit, so without this a test asserting either sees nothing - not
    because the code is wrong but because the test rolls back. A test that asks for
    `django_capture_on_commit_callbacks` is asking about the deferral itself, so it keeps the real one,
    and so does a `transaction=True` test, whose transactions really commit.
    """
    marker = request.node.get_closest_marker("django_db")
    deferral_is_the_subject = "django_capture_on_commit_callbacks" in request.fixturenames
    if marker is None or deferral_is_the_subject or marker.kwargs.get("transaction"):
        yield
        return
    monkeypatch.setattr(transaction, "on_commit", lambda callback, using=None, robust=False: callback())
    yield


@pytest.fixture(autouse=True)
def _every_post_carries_an_idempotency_key(monkeypatch):
    """A real caller always sends one - the clients mint it per attempt - so a suite whose every POST
    arrives without one is testing a caller that does not exist. A fresh key per call, so each is its
    own first attempt; a test about the header passes its own, or sends through `generic` to omit it.
    """
    posting = Client.post

    def post(self, path, *args, headers=None, **kwargs):
        headers = {IdempotencyMixin.idempotency_header: str(uuid.uuid4()), **(headers or {})}
        return posting(self, path, *args, headers=headers, **kwargs)

    monkeypatch.setattr(Client, "post", post)


class _Collected(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(getattr(record, PAYLOAD))


def _collected_from(logger):
    handler = _Collected()
    logger.addHandler(handler)
    try:
        yield handler.lines
    finally:
        logger.removeHandler(handler)


@pytest.fixture
def logged():
    """Every event `log()` wrote during the test, as the dict it carried - so a log call is asserted
    like any other return value rather than left as a line nothing checks."""
    yield from _collected_from(LOGGER)


@pytest.fixture
def audited():
    """The same for `audit()`, whose logger does not propagate and so never reaches `logged`."""
    yield from _collected_from(AUDIT_LOGGER)


@pytest.fixture(autouse=True, scope="session")
def _a_storage_bucket_of_its_own():
    """Django hands each worker a `test_` copy of the database, but object storage would otherwise
    be the bucket the dev stack serves - and an object a test writes outlives the row rolled back
    beside it. Named per worker and per mutation run, the same way the test database is.

    `override_settings` resets the storage registry and `default_storage`, but every `FileField`
    with a callable storage called it once at import and kept the instance, so those are rebuilt.
    """
    from django.apps import apps as django_apps
    from django.db import models
    from django.test import override_settings

    from apps.common.storage import ensure_bucket

    suffix = (os.environ.get("MUTMUT_DB_SUFFIX"), os.environ.get("PYTEST_XDIST_WORKER"))
    bucket = "-".join(filter(None, (config.STORAGE.BUCKET_NAME, "test", *suffix)))
    default = {**django_settings.STORAGES["default"]}
    default["OPTIONS"] = {**default["OPTIONS"], "bucket_name": bucket}
    with override_settings(STORAGES={**django_settings.STORAGES, "default": default}):
        for model in django_apps.get_models():
            for field in model._meta.get_fields():
                if isinstance(field, models.FileField) and hasattr(field, "_storage_callable"):
                    field.storage = field._storage_callable()
        ensure_bucket()
        yield


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


def _refuse_a_drifted_template(template):
    """Refuse a template built before a migration that exists now.

    Every session copies this database instead of migrating one, so a template a migration has passed
    runs the whole suite against a schema nobody wrote - and the suite passes, because the tests that
    would notice are the ones that cannot run. Counting rows against files is coarse, and that is the
    point: it is a check nobody has to remember to run.
    """
    import psycopg
    from django.db.migrations.loader import MigrationLoader

    # Django's own resolution rather than a count of files: the template carries every installed app's
    # migrations, and the apps this project wrote are a fraction of them.
    on_disk = set(MigrationLoader(None, ignore_no_migrations=True).disk_migrations)
    database = django_settings.DATABASES["default"]
    arguments = {
        "host": database["HOST"],
        "port": database["PORT"] or 5432,
        "user": database["USER"],
        "password": database["PASSWORD"],
        "dbname": template,
        "autocommit": True,
    }
    try:
        with psycopg.connect(**arguments) as connection:
            applied = set(connection.execute("SELECT app, name FROM django_migrations").fetchall())
    except psycopg.Error as error:
        raise pytest.UsageError(
            f"MUTMUT_DB_TEMPLATE names {template!r}, which cannot be read ({error}). Build it with "
            "`python scripts/mutation_template.py build`, or unset the variable to migrate instead."
        ) from error
    missing = sorted(f"{app}.{name}" for app, name in on_disk - applied)
    if missing:
        raise pytest.UsageError(
            f"the template {template!r} was built before {', '.join(missing[:3])}"
            f"{'' if len(missing) <= 3 else f' and {len(missing) - 3} more'}, so every session would "
            "copy a schema that is not the one the migrations build. Rebuild it with "
            "`python scripts/mutation_template.py build`."
        )


def pytest_configure(config):
    """A run may only reuse a database it cloned itself.

    `--reuse-db` is how a templated mutation run stops pytest-django rebuilding what it already
    cloned. The same flag without a template means every mutant in the run shares one database, and
    the fixtures each test leaves behind (a user row, a session, a queued mail) accumulate state
    nothing heals between mutants.

    Checked here rather than in a fixture: raising from a session fixture fails every test that
    wanted a database, and a suite that errors is exactly what a mutation run counts as a kill - the
    misconfiguration would score as a clean sweep instead of stopping the run.
    """
    template = os.environ.get("MUTMUT_DB_TEMPLATE")
    if template:
        # Only for an ordinary run (a template, no mutation suffix): a mutation run opens thousands of
        # sessions, each would pay for this, and `mutation_template.py check` already answered it once
        # for that whole run. Only the xdist controller asks, not every worker.
        if not os.environ.get("MUTMUT_DB_SUFFIX") and not os.environ.get("PYTEST_XDIST_WORKER"):
            _refuse_a_drifted_template(template)
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
    """A test database of its own for a run that asks for one, named by `MUTMUT_DB_SUFFIX`.

    mutmut runs one child process at a time (`--max-children 1`), but this still has to be safe if
    that ever changes: two children sharing one process-derived name would build and drop the same
    `test_<name>` and fail over each other rather than over the mutation, which scores as a kill and
    reads as a suite that caught something.

    The suffix has to be read here rather than baked into settings, which is imported once before
    any child forks.
    """
    suffix = os.environ.get("MUTMUT_DB_SUFFIX")
    template = os.environ.get("MUTMUT_DB_TEMPLATE")
    # A template with no suffix is an ordinary `pytest -n auto` run asking to copy a database rather
    # than migrate one - the same trade for the same reason, since every xdist worker migrates its own
    # otherwise.
    if not suffix and not template:
        return
    # Composed with the xdist worker rather than replacing it: an ordinary run is under xdist, and a
    # name that dropped the worker id would hand every worker the same database.
    worker = os.environ.get("PYTEST_XDIST_WORKER")
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
