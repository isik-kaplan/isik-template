"""No raw SQL spells a table name; names come from `_meta` through `apps.common.db`.

Source literals, since rendered SQL misses everything outside a trigger. Tables only: a model move changes
one silently, while a wrong column fails loudly.
"""

import ast
import re
from pathlib import Path

import pytest
from django.apps import apps as django_apps
from isik.common.utils.exemptions import exemption_class

from apps.common.db import model_db_name


# Optional schema qualifier (`%I` or literal); only the table is captured.
TABLE_REFERENCE = re.compile(
    r"\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:(?:%I|[a-z][a-z0-9_]*)\.)?([a-z][a-z0-9_]+)",
    re.IGNORECASE,
)

ROOT = Path(__file__).resolve().parents[3]
SEARCHED = ("apps", "{{ cookiecutter.project_slug }}", "scripts")

LiteralTableName = exemption_class(
    "LiteralTableName",
    rule="raw-sql.literal-table-name",
    why="Raw SQL resolves a table's name from its model, so renaming the table cannot leave the SQL behind.",
)

# Where spelling the physical name is the assertion rather than a way of reaching the table.
EXEMPT = {
    ("apps/common/tests/test_raw_sql_names.py", "users_user"): (
        LiteralTableName(
            reason=(
                "This file's own detector tests: the literal is the input to the detector, not a way of reaching "
                "the table."
            )
        )
    ),
}


def project_tables():
    tables = {model_db_name(model) for model in django_apps.get_models()}
    return tables | {
        model_db_name(field.remote_field.through)
        for model in django_apps.get_models()
        for field in model._meta.many_to_many
    }


def source_files():
    for directory in SEARCHED:
        for path in sorted((ROOT / directory).rglob("*.py")):
            # Migrations are immutable history.
            if "migrations" in path.parts:
                continue
            yield path


def tables_named_in(source, tables):
    """Literals only; the SQL keyword in front tells a query from prose."""
    found = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            found |= {name.lower() for name in TABLE_REFERENCE.findall(node.value)} & tables
    return found


def tree_sources():
    for path in source_files():
        yield path.relative_to(ROOT).as_posix(), path.read_text()


def offenders(sources=None):
    tables = project_tables()
    return [
        f"{relative} names {table}"
        for relative, source in (tree_sources() if sources is None else sources)
        for table in sorted(tables_named_in(source, tables))
        if (relative, table) not in EXEMPT
    ]


def test_no_source_file_spells_a_project_table_in_sql():
    assert offenders() == [], "use apps.common.db.model_db_name instead"


def test_the_sweep_reports_a_file_that_spells_one():
    repair = 'cursor.execute("DELETE FROM users_user WHERE id = %s")'

    assert offenders([("apps/somewhere/repair.py", repair)]) == ["apps/somewhere/repair.py names users_user"]


def test_an_exempt_site_is_passed_over():
    exempt, _table = next(iter(EXEMPT))

    assert offenders([(exempt, 'x = "SELECT username FROM users_user"')]) == []


def test_the_sweep_reaches_the_files_it_is_meant_to_check():
    """A path that stopped resolving would empty the sweep, and an empty sweep passes."""
    paths = {path.relative_to(ROOT).as_posix() for path in source_files()}

    assert "apps/common/sql.py" in paths
    assert "{{ cookiecutter.project_slug }}/settings.py" in paths
    assert "scripts/mutation_template.py" in paths
    assert not any("/migrations/" in path for path in paths)


def test_every_exemption_still_names_a_literal_that_is_there():
    """A stale exemption is a hole nobody decided to leave open."""
    tables = project_tables()
    stale = [
        f"{relative}:{table}"
        for relative, table in EXEMPT
        if table not in tables_named_in((ROOT / relative).read_text(), tables)
    ]

    assert stale == []


def test_every_exemption_gives_a_reason():
    """Typed, so the reason is held to its floor where it is written."""
    assert [key for key, reason in EXEMPT.items() if not isinstance(reason, LiteralTableName)] == []


def test_the_tables_include_the_join_tables_a_many_to_many_creates():
    """`users_user_groups` has no model of its own to ask, and a trigger reaches it all the same."""
    from apps.users.models import User

    assert model_db_name(User.groups.through) in project_tables()


@pytest.mark.parametrize(
    ("sql", "expected"),
    [
        ("SELECT username FROM users_user", {"users_user"}),
        ("SELECT username FROM public.users_user", {"users_user"}),
        ("DELETE FROM %I.users_user", {"users_user"}),
        ("INSERT INTO users_user (id) VALUES (1)", {"users_user"}),
        ("UPDATE users_user SET username = 'x'", {"users_user"}),
        ("SELECT u.id FROM pg_class c JOIN users_user u ON true", {"users_user"}),
        # Prose, which is most of what mentions a table name in this tree.
        ("users_user exists once per deployment", set()),
        # A catalog relation is not a project table and has no model to ask.
        ("SELECT oid FROM pg_namespace", set()),
    ],
)
def test_the_detector_tells_sql_from_prose(sql, expected):
    """Guards the guard: a pattern that matched nothing would pass on any tree."""
    assert tables_named_in(f'x = "{sql}"', project_tables()) == expected
