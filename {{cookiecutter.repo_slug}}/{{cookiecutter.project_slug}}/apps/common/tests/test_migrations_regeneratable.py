"""Every migration of the project's apps is what `makemigrations` writes, so they can always be regenerated.

Rows the schema needs are written on `post_migrate` instead, where a regeneration can't lose them.
"""

from django.db import migrations
from django.db.migrations.loader import MigrationLoader


GENERATED_MODULES = ("django.db.migrations.operations.", "pgtrigger.migrations")


def hand_written(operations):
    return [
        type(operation).__name__
        for operation in operations
        if not type(operation).__module__.startswith(GENERATED_MODULES)
        or type(operation).__name__ in {"RunPython", "RunSQL", "SeparateDatabaseAndState"}
    ]


def test_no_migration_holds_an_operation_makemigrations_would_not_write():
    loader = MigrationLoader(None, ignore_no_migrations=True)
    found = {
        f"{label}.{name}": hand_written(migration.operations)
        for (label, name), migration in loader.disk_migrations.items()
        if type(migration).__module__.startswith("apps.")
    }
    assert found
    assert {migration: ops for migration, ops in found.items() if ops} == {}


def test_a_data_migration_is_caught():
    assert hand_written([migrations.RunPython(migrations.RunPython.noop), migrations.RunSQL("")]) == [
        "RunPython",
        "RunSQL",
    ]
