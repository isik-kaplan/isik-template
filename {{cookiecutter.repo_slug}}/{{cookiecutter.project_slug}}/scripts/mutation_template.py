"""Build the template database mutation runs clone, and prove a clone is faithful to it.

Almost all of a mutant's cost is building a test database - migrating one from scratch every time a
clone of an already-migrated one would do. A clone is fresh *and* cheap, and has to stay fresh: the
shared fixtures commit on purpose, so reusing one database across sessions accumulates state nothing
heals, which cloning avoids by handing each session its own copy.

The template is built by running one database-touching test rather than `migrate` directly, so it is
built the same way pytest-django builds any other test database - through `django_db_modify_db_settings`
in conftest.py, which is also what points a mutation run's own sessions at a clone of it.

    python scripts/mutation_template.py build
    python scripts/mutation_template.py check     # a clone against a freshly migrated database
    python scripts/mutation_template.py drop

`check` is not ceremony: a drifted template measures every mutant against the wrong schema, and the
failure mode of this whole subsystem is a confident green.
"""

import argparse
import json
import os
import subprocess
import sys
from functools import cache
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

# Deliberately outside the `test_%` namespace. Sweeping leftover test databases is routine here, and a
# template caught by that sweep would be rebuilt from scratch without anything reporting why.
TEMPLATE = "mutation_template_{{ cookiecutter.project_slug }}"

# Any test that requests a database triggers pytest-django's migration step - there is no fixture data
# here worth seeding beyond that, so the cheapest one that does is the whole seed. Revisit if a future
# app adds fixtures expensive enough to be worth baking into the template too.
SEED_TESTS = ["apps/users/tests/test_permissions.py::test_the_migrated_database_has_no_permissions_at_all"]

# The parts of a schema a mutation verdict could plausibly depend on. Compared as sorted rows, so the
# comparison is order-independent without having to trust either database's row order.
SCHEMA_QUERIES = {
    "schemas": """
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema'
        ORDER BY schema_name
    """,
    "columns": """
        SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema'
        ORDER BY table_schema, table_name, column_name
    """,
    "constraints": """
        SELECT table_schema, table_name, constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema'
        -- Postgres names a plain NOT NULL column's synthesized CHECK from its table's own oid, so this
        -- is a real column's constraint but never the same name twice - not even between two databases
        -- built from one identical migration a second apart. Compared by count instead, below.
        AND constraint_name !~ '^[0-9]+(_[0-9]+)*_not_null$'
        ORDER BY table_schema, table_name, constraint_name
    """,
    "indexes": """
        SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'
        ORDER BY schemaname, tablename, indexname
    """,
    "triggers": """
        SELECT event_object_schema, event_object_table, trigger_name, action_statement
        FROM information_schema.triggers
        WHERE event_object_schema NOT LIKE 'pg_%'
        ORDER BY event_object_schema, event_object_table, trigger_name, action_statement
    """,
}


@cache
def _database_settings():
    """Read from Django rather than the environment, so this cannot disagree with what the tests use."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{ cookiecutter.project_slug }}.settings")
    sys.path.insert(0, str(ROOT))
    import django

    django.setup()
    from django.conf import settings

    return settings.DATABASES["default"]


def psql(sql, database=None, quiet=True):
    """One statement against the maintenance database, outside any transaction.

    `CREATE DATABASE` cannot run inside one, which rules out doing this through Django's connection.
    """
    database_settings = _database_settings()
    command = [
        "psql",
        "-h",
        database_settings["HOST"],
        "-p",
        str(database_settings["PORT"] or 5432),
        "-U",
        database_settings["USER"],
        "-d",
        database or database_settings["NAME"],
        "-v",
        "ON_ERROR_STOP=1",
        "-tAc",
        sql,
    ]
    environment = {**os.environ, "PGPASSWORD": database_settings.get("PASSWORD", "")}
    result = subprocess.run(command, capture_output=True, text=True, env=environment)
    if result.returncode:
        raise SystemExit(f"psql failed: {result.stderr.strip()}\n  while running: {sql.strip()[:120]}")
    if not quiet and result.stdout.strip():
        print(result.stdout.strip())
    return result.stdout


def disconnect(database):
    """Nothing may hold a connection to a template: Postgres refuses to copy a database that is in
    use, and the error arrives at the clone rather than at whatever left the connection open."""
    psql(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{database}' AND pid <> pg_backend_pid()"
    )


def clone(template, into):
    disconnect(template)
    psql(f'DROP DATABASE IF EXISTS "{into}"')
    psql(f'CREATE DATABASE "{into}" TEMPLATE "{template}"')


def _run_seed_tests(suffix):
    """Run `SEED_TESTS` under the same env vars conftest.py's `django_db_modify_db_settings` reads,
    so the database it builds is named and migrated exactly the way a mutation run's own would be."""
    return subprocess.run(
        [sys.executable, "-m", "pytest", *SEED_TESTS, "-q", "--no-cov", "-n", "0", "--reuse-db"],
        cwd=ROOT,
        # MUTMUT_TEMPLATE_BUILD because conftest.py refuses --reuse-db without a template, and this
        # is the run that creates one - the only session for which none can exist yet.
        env={**os.environ, "MUTMUT_DB_SUFFIX": suffix, "MUTMUT_TEMPLATE_BUILD": "1"},
        capture_output=True,
        text=True,
    )


def build(arguments):
    """One migrated database, kept under a name the test sweeps will not take."""
    del arguments
    database_settings = _database_settings()
    seed = f"test_{database_settings['NAME']}_templateseed"

    print(f"building {seed} from migrations (the cost this exists to pay only once)...")
    disconnect(seed)
    psql(f'DROP DATABASE IF EXISTS "{seed}"')
    result = _run_seed_tests("templateseed")
    if result.returncode:
        raise SystemExit(
            f"the seed test did not pass, so the template would be built from a broken database:\n"
            f"{result.stdout[-2000:]}"
        )

    disconnect(seed)
    disconnect(TEMPLATE)
    psql(f'DROP DATABASE IF EXISTS "{TEMPLATE}"')
    psql(f'ALTER DATABASE "{seed}" RENAME TO "{TEMPLATE}"')
    print(f"template ready: {TEMPLATE}")
    return 0


def _schema_of(database):
    return {name: psql(query, database=database) for name, query in SCHEMA_QUERIES.items()}


def check(arguments):
    """A clone of the template against a database built from the migrations, compared schema to schema.

    The guard the whole optimisation rests on. A stale template is not a slow build or a red test - it
    is a mutation report measured against a schema the code no longer has.
    """
    del arguments
    database_settings = _database_settings()
    fresh_suffix = "templatecheck"
    fresh = f"test_{database_settings['NAME']}_{fresh_suffix}"
    cloned = f"{TEMPLATE}_check"

    print("cloning the template...")
    clone(TEMPLATE, cloned)

    print("building a database from migrations to compare it against...")
    disconnect(fresh)
    psql(f'DROP DATABASE IF EXISTS "{fresh}"')
    result = _run_seed_tests(fresh_suffix)
    if result.returncode:
        raise SystemExit(f"the comparison database could not be built:\n{result.stdout[-2000:]}")

    differences = {}
    for name in SCHEMA_QUERIES:
        from_clone = sorted(_schema_of(cloned)[name].splitlines())
        from_fresh = sorted(_schema_of(fresh)[name].splitlines())
        only_clone = [row for row in from_clone if row not in from_fresh]
        only_fresh = [row for row in from_fresh if row not in from_clone]
        if only_clone or only_fresh:
            differences[name] = {"only_in_clone": only_clone[:20], "only_in_fresh": only_fresh[:20]}
        print(
            f"  {name:12} clone {len(from_clone):5}  fresh {len(from_fresh):5}"
            f"  {'differs' if name in differences else 'match'}"
        )

    disconnect(cloned)
    psql(f'DROP DATABASE IF EXISTS "{cloned}"')
    disconnect(fresh)
    psql(f'DROP DATABASE IF EXISTS "{fresh}"')

    if differences:
        print("\nthe template does not match what the migrations build:")
        print(json.dumps(differences, indent=2)[:4000])
        print("\nRebuild it: python scripts/mutation_template.py build")
        return 1
    print("\nthe template matches a freshly migrated database")
    return 0


def drop(arguments):
    del arguments
    disconnect(TEMPLATE)
    psql(f'DROP DATABASE IF EXISTS "{TEMPLATE}"')
    print(f"dropped {TEMPLATE}")
    return 0


def name(arguments):
    """The template's name, for a caller that must not repeat it.

    The CI job needs it to pass `MUTMUT_DB_TEMPLATE`, and a second copy there could disagree with this
    one silently: the clone would fail, every mutant would migrate its own database, and the only
    symptom is that the run got slow.
    """
    del arguments
    print(TEMPLATE)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "check", "drop", "name"))
    arguments = parser.parse_args(argv)
    return {"build": build, "check": check, "drop": drop, "name": name}[arguments.action](arguments)


if __name__ == "__main__":
    sys.exit(main())
