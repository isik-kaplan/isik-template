{% if cookiecutter.storage != "disk" -%}
import contextlib
{% endif -%}
import logging
import os
import uuid
from pathlib import Path

import pytest
from django.conf import settings as django_settings
from django.core.cache import cache
from django.db import connections, transaction
from django.test import Client
from hypothesis import settings as hypothesis_settings
from isik.django.apps.common.db.concurrency import current_concurrency_etag
from isik.django.apps.idempotency.drf import IdempotencyMixin

from apps.common.logging.emit import AUDIT_LOGGER, LOGGER
from apps.common.logging.events import PAYLOAD

from {{ cookiecutter.project_slug }}.celery import app as celery_app
{%- if cookiecutter.storage != "disk" %}
from {{ cookiecutter.project_slug }}.config import CONFIG as config
{%- endif %}


# A busy machine runs one example past the 200 ms default and fails a test that found nothing.
hypothesis_settings.register_profile("{{ cookiecutter.project_slug }}", deadline=None)
hypothesis_settings.load_profile("{{ cookiecutter.project_slug }}")

CONFIGURED_CACHES = django_settings.CACHES


@pytest.fixture(autouse=True, scope="session")
def _a_cache_of_its_own():
    """Per-process: each worker clears it between tests, which would wipe another's counts if shared."""
    from django.test import override_settings

    with override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}):
        yield


@pytest.fixture(autouse=True)
def _clear_cache():
    """Rate limits count in the cache, so an earlier test's requests would starve a later one's."""
    cache.clear()


@pytest.fixture(autouse=True)
def _commit_callbacks_run_where_a_request_would_commit(request, monkeypatch):
    """pytest-django's transaction never commits. A test about the deferral itself keeps the real one."""
    marker = request.node.get_closest_marker("django_db")
    deferral_is_the_subject = "django_capture_on_commit_callbacks" in request.fixturenames
    if marker is None or deferral_is_the_subject or marker.kwargs.get("transaction"):
        yield
        return
    monkeypatch.setattr(transaction, "on_commit", lambda callback, using=None, robust=False: callback())
    yield


@pytest.fixture(autouse=True)
def _tasks_run_in_process(monkeypatch):
    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    monkeypatch.setattr(celery_app.conf, "task_eager_propagates", True)


@pytest.fixture(autouse=True)
def _every_write_carries_an_idempotency_key(monkeypatch):
    """Real clients always send one. A test about the header passes its own, or uses `generic`."""
    for method in ("post", "put", "patch", "delete"):
        monkeypatch.setattr(Client, method, _keyed(getattr(Client, method)))


def _keyed(send):
    def write(self, path, *args, headers=None, **kwargs):
        headers = {IdempotencyMixin.idempotency_header: str(uuid.uuid4()), **(headers or {})}
        return send(self, path, *args, headers=headers, **kwargs)

    return write


def versioned(instance):
    """Read from the database: a sign-in or trigger may have moved the version since the test made it."""
    return {"If-Match": current_concurrency_etag(instance.__class__, instance.pk)}


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
    """Every event `log()` wrote during the test, as the dict it carried."""
    yield from _collected_from(LOGGER)


@pytest.fixture
def audited():
    """The same for `audit()`, whose logger does not propagate to `logged`."""
    yield from _collected_from(AUDIT_LOGGER)


{% if cookiecutter.storage == "disk" -%}
@pytest.fixture(autouse=True, scope="session")
def _a_storage_directory_of_its_own(tmp_path_factory):
    """A file a test writes outlives its rolled-back row. A `FileField` with a callable storage kept
    the instance from import, so those are rebuilt."""
    from django.apps import apps as django_apps
    from django.db import models
    from django.test import override_settings

    default = {**django_settings.STORAGES["default"]}
    default["OPTIONS"] = {**default["OPTIONS"], "location": str(tmp_path_factory.mktemp("media"))}
    with override_settings(STORAGES={**django_settings.STORAGES, "default": default}):
        for model in django_apps.get_models():
            for field in model._meta.get_fields():
                if isinstance(field, models.FileField) and hasattr(field, "_storage_callable"):
                    field.storage = field._storage_callable()
        yield
{%- else -%}
@pytest.fixture(autouse=True, scope="session")
def _a_storage_bucket_of_its_own():
    """An object a test writes outlives its rolled-back row. A `FileField` with a callable storage
    kept the instance from import, so those are rebuilt."""
    from django.apps import apps as django_apps
    from django.core.files.storage import storages
    from django.db import models
    from django.test import override_settings

    suffix = (os.environ.get("MUTMUT_DB_SUFFIX"), os.environ.get("PYTEST_XDIST_WORKER"))
    bucket = "-".join(filter(None, (config.STORAGE.BUCKET_NAME, "test", *suffix)))
    default = {**django_settings.STORAGES["default"]}
    default["OPTIONS"] = {**default["OPTIONS"], "bucket_name": bucket}
    with override_settings(STORAGES={**django_settings.STORAGES, "default": default}):
        for model in django_apps.get_models():
            for field in model._meta.get_fields():
                if isinstance(field, models.FileField) and hasattr(field, "_storage_callable"):
                    field.storage = field._storage_callable()
        # The app never creates a bucket. us-east-1 is the one region S3 takes no LocationConstraint for.
        client = storages["default"].connection.meta.client
        region = storages["default"].region_name
        options = {} if region == "us-east-1" else {"CreateBucketConfiguration": {"LocationConstraint": region}}
        with contextlib.suppress(client.exceptions.BucketAlreadyOwnedByYou):
            client.create_bucket(Bucket=bucket, **options)
        yield
{%- endif %}


# On the settings object, not a module global: mutmut re-imports this file mid-run, after
# pytest-django has already replaced the live name with the test one.
if not hasattr(django_settings, "_ORIGINAL_DATABASE_NAMES"):
    django_settings._ORIGINAL_DATABASE_NAMES = {
        alias: database["NAME"] for alias, database in django_settings.DATABASES.items()
    }
_DATABASE_NAMES = django_settings._ORIGINAL_DATABASE_NAMES


def _refuse_a_drifted_template(template):
    """A stale template runs the suite against a schema nobody wrote, and the suite still passes."""
    import psycopg
    from django.db.migrations.loader import MigrationLoader

    # Every installed app's migrations, not just this project's files.
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
    """A run may only reuse a database it cloned itself. Here, not in a fixture: a fixture error fails
    every test, which a mutation run scores as a kill."""
    template = os.environ.get("MUTMUT_DB_TEMPLATE")
    if template:
        # A mutation run already ran `mutation_template.py check` once; only the xdist controller asks.
        if not os.environ.get("MUTMUT_DB_SUFFIX") and not os.environ.get("PYTEST_XDIST_WORKER"):
            _refuse_a_drifted_template(template)
        # Not `--reuse-db` in pyproject.toml: there it would also reach an ordinary run.
        config.option.reuse_db = True
        return
    # The session building the template reuses without one.
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
    """Read here, not in settings, which is imported once before any mutmut child forks."""
    suffix = os.environ.get("MUTMUT_DB_SUFFIX")
    template = os.environ.get("MUTMUT_DB_TEMPLATE")
    if not suffix and not template:
        return
    worker = os.environ.get("PYTEST_XDIST_WORKER")
    for alias, name in _DATABASE_NAMES.items():
        test_name = "_".join(part for part in (f"test_{name}", suffix, worker) if part)
        django_settings.DATABASES[alias].setdefault("TEST", {})["NAME"] = test_name
        # The live connection's copy, taken before any fixture, is what the database is created from.
        connections[alias].settings_dict.setdefault("TEST", {})["NAME"] = test_name
        # Postgres truncates a longer identifier rather than refusing it.
        if len(test_name) > 63:
            raise pytest.UsageError(
                f"the test database name {test_name!r} is {len(test_name)} characters, past "
                "Postgres's limit of 63 - shorten MUTMUT_DB_SUFFIX."
            )
        if template:
            _clone_template(template, test_name, django_settings.DATABASES[alias], name)


def _clone_template(template, into, database, maintenance_name):
    """Runs before pytest-django's setup, so `--reuse-db` finds this copy rather than building one."""
    import psycopg

    connection_arguments = {
        "host": database["HOST"],
        "port": database["PORT"] or 5432,
        "user": database["USER"],
        "password": database["PASSWORD"],
        # Never the live one: after the first session that is the database about to be dropped.
        "dbname": maintenance_name,
        "autocommit": True,
    }
    with psycopg.connect(**connection_arguments) as maintenance:
        # Postgres refuses to copy or drop a database anything is connected to.
        for target in (template, into):
            maintenance.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                (target,),
            )
        maintenance.execute(f'DROP DATABASE IF EXISTS "{into}"')
        maintenance.execute(f'CREATE DATABASE "{into}" TEMPLATE "{template}"')


# No test may write it: concurrent sessions share one tree, and a truncate-then-write race empties it.
_PYPROJECT = Path(__file__).resolve().parent / "pyproject.toml"
MUTMUT_TABLE = "[tool.mutmut]"


@pytest.fixture(autouse=True)
def _fail_a_test_that_destroys_the_tree_configuration():
    """The table rather than the bytes, because mutmut itself writes this file mid-run."""
    yield
    assert MUTMUT_TABLE in _PYPROJECT.read_text(), (
        f"{_PYPROJECT.name} lost its {MUTMUT_TABLE} table during this test. Several sessions can "
        "share one tree in phase two, so a write here races the others' reads and can empty the "
        "file - after which every import raises and each mutant is recorded as killed. Point "
        "whatever this test writes at a copy in tmp_path instead."
    )
