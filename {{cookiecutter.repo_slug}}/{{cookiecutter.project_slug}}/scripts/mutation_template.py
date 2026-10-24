"""Build the template database mutation runs clone, and prove a clone matches fresh migrations.

Cloning beats migrating per mutant, and beats reusing one database (the fixtures commit). Built by
running a seed test, not `migrate`, so it goes through conftest.py's `django_db_modify_db_settings`.

    python scripts/mutation_template.py build
    python scripts/mutation_template.py check     # a clone against a freshly migrated database
    python scripts/mutation_template.py drop
"""

import argparse
import json
import os
import subprocess
import sys
from functools import cache
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

# Outside `test_%`, so sweeps of leftover test databases don't take it.
TEMPLATE = "mutation_template_{{ cookiecutter.project_slug }}"

# Any database test triggers the migrations; this is a cheap one.
SEED_TESTS = ["apps/users/tests/test_permissions.py::test_the_migrated_database_has_only_the_declared_permissions"]

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
    """From Django, not the environment, so it matches what the tests use."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{ cookiecutter.project_slug }}.settings")
    sys.path.insert(0, str(ROOT))
    import django

    django.setup()
    from django.conf import settings

    return settings.DATABASES["default"]


def psql(sql, database=None, quiet=True):
    """Via psql, not Django's connection: `CREATE DATABASE` can't run in a transaction."""
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
    """Postgres refuses to copy a database that has open connections."""
    psql(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{database}' AND pid <> pg_backend_pid()"
    )


def clone(template, into):
    disconnect(template)
    psql(f'DROP DATABASE IF EXISTS "{into}"')
    psql(f'CREATE DATABASE "{into}" TEMPLATE "{template}"')


def _run_seed_tests(suffix):
    return subprocess.run(
        [sys.executable, "-m", "pytest", *SEED_TESTS, "-q", "--no-cov", "-n", "0", "--reuse-db"],
        cwd=ROOT,
        # conftest.py refuses --reuse-db without a template, and this run creates it.
        env={**os.environ, "MUTMUT_DB_SUFFIX": suffix, "MUTMUT_TEMPLATE_BUILD": "1"},
        capture_output=True,
        text=True,
    )


def build(arguments):
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
    """Compare a clone's schema with a freshly migrated one: a stale template gives silently wrong verdicts."""
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
    """For CI, so the name isn't duplicated: a mismatch only shows up as a slow run."""
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
