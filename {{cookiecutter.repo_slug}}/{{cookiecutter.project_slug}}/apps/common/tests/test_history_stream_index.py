"""Reading one page of an object's history does not cost the whole of it.

pghistory's aggregate finds each row's predecessor with `pgh_obj_id = X AND pgh_id < N`, once per row
of the object's stream before the page's `LIMIT` applies. On its own single-column `pgh_obj_id` index
each lookup reads and sorts the whole stream, so a page costs the square of the history.

isik's `track_events()` declares the index. Asserted over every event table rather than over the
decorator, because `pghistory.track()` can be called directly and a table declared that way would
lose the index with nothing said.
"""

import pytest
from django.apps import apps
from django.db import connection
from isik.django.apps.common.db import object_stream_index

from apps.common.db import model_db_name


STREAM = object_stream_index().fields


def streamed_event_models():
    """Every concrete event table with a stream at all. `pgh_tracked_model` marks a generated event
    model; `obj_field=None` declares one with no `pgh_obj`."""
    return [
        model
        for model in apps.get_models()
        if getattr(model, "pgh_tracked_model", None) is not None
        and model._meta.managed
        and not model._meta.proxy
        and any(field.name == "pgh_obj" for field in model._meta.fields)
    ]


def test_there_is_an_event_table_to_check():
    """An empty list passes every assertion below."""
    assert "users.UserEvent" in {model._meta.label for model in streamed_event_models()}


def test_every_event_table_declares_the_index():
    without = sorted(
        model._meta.label
        for model in streamed_event_models()
        if not any(index.fields == STREAM for index in model._meta.indexes)
    )

    assert without == []


@pytest.mark.django_db
def test_every_event_table_has_it_in_the_database():
    """Declared and migrated are different claims, and only the second makes a query fast."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = CURRENT_SCHEMA()")
        by_table = {}
        for table, definition in cursor.fetchall():
            by_table.setdefault(table, []).append(definition)

    unindexed = sorted(
        model._meta.label
        for model in streamed_event_models()
        if not any("(pgh_obj_id, pgh_id DESC)" in definition for definition in by_table[model_db_name(model)])
    )

    assert unindexed == []
