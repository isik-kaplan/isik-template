"""`manage.py triggers` lists what the registry holds, filtered and rendered as asked."""

import json
from io import StringIO

import pgtrigger
import pytest
from django.core.management import call_command
from hypothesis import given
from hypothesis import strategies as st

from apps.common.management.commands.triggers import _effects


LABELS = sorted({model._meta.label for model, _ in pgtrigger.registered()})
# A slice of a real label, in any case, so the filter keeps something more often than not.
FILTERS = st.builds(
    lambda label, start, length, upper: label[start : start + length].upper() if upper else label[start:][:length],
    st.sampled_from(LABELS),
    st.integers(0, 12),
    st.integers(1, 20),
    st.booleans(),
)
TABLE = st.from_regex(r"[a-z][a-z_]{0,20}", fullmatch=True)


def _run(*args):
    out = StringIO()
    call_command("triggers", *args, stdout=out)
    return out.getvalue()


@pytest.mark.django_db
@pytest.mark.parametrize("sql", [False, True])
@given(needle=FILTERS)
def test_the_json_lists_exactly_the_models_whose_label_holds_the_filter(sql, needle):
    rows = json.loads(_run("--format=json", f"--model={needle}", *(["--sql"] if sql else [])))

    expected = sorted(label for label in LABELS if needle.lower() in label.lower())
    assert sorted(row["model"] for row in rows) == expected
    assert all(("sql" in trigger) is sql for row in rows for trigger in row["triggers"])


@pytest.mark.django_db
@pytest.mark.parametrize("sql", [False, True])
@given(needle=FILTERS)
def test_the_text_heads_each_listed_model_and_carries_the_body_only_when_asked(sql, needle):
    printed = _run(f"--model={needle}", *(["--sql"] if sql else []))
    rows = json.loads(_run("--format=json", f"--model={needle}", "--sql"))

    for row in rows:
        assert f"{row['model']}  ({row['table']})" in printed
        for trigger in row["triggers"]:
            assert f"  {trigger['name']}  {trigger['timing']}" in printed
            if trigger["condition"]:
                assert f"    when {trigger['condition']}" in printed
            assert (f"    {trigger['sql']}" in printed) is sql


@given(written=st.sets(TABLE, max_size=3), locked=st.sets(TABLE, max_size=3), stamped=st.sets(TABLE, max_size=3))
def test_a_body_is_described_by_the_tables_it_writes_locks_and_the_columns_it_stamps(written, locked, stamped):
    body = " ".join(
        [
            *(f'INSERT INTO "{table}" VALUES (1);' for table in written),
            *(f'PERFORM 1 FROM "{table}" WHERE id = 1 FOR UPDATE;' for table in locked),
            *(f'NEW."{column}" := 1;' for column in stamped),
            "RETURN NEW;",
        ]
    )

    effects = _effects(body)

    assert effects == (
        [f"writes {table}" for table in sorted(written)]
        + [f"stamps {column}" for column in sorted(stamped)]
        + [f"locks {table}" for table in sorted(locked - written)]
        or ["see --sql"]
    )
