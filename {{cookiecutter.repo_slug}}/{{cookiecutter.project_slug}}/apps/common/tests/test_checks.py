"""Every event table is append-only, however its model was tracked (common.E001)."""

from types import SimpleNamespace

import pgtrigger
from isik.django.apps.common.db import APPEND_ONLY_TRIGGERS

from apps.common import checks
from apps.common.checks import event_models, event_models_are_append_only


# A class, not an instance: the check keys a dict by model.
STUB = type("Event", (), {"_meta": SimpleNamespace(label="stub.Event")})


def _only_the_stub(monkeypatch, triggers):
    monkeypatch.setattr(checks, "event_models", lambda: [STUB])
    monkeypatch.setattr(pgtrigger, "registered", lambda: [(STUB, SimpleNamespace(name=name)) for name in triggers])


def test_every_event_model_as_shipped_is_append_only():
    assert event_models()
    assert event_models_are_append_only(app_configs=None) == []


def test_the_event_models_are_tables_not_pghistorys_views():
    assert all(model._meta.managed and not model._meta.proxy for model in event_models())
    assert all(model.__name__.endswith("Event") for model in event_models())


def test_a_model_missing_a_guard_is_named(monkeypatch):
    _only_the_stub(monkeypatch, APPEND_ONLY_TRIGGERS[:1])

    (error,) = event_models_are_append_only(app_configs=None)

    assert (error.id, error.msg) == ("common.E001", "These event models are not append-only: stub.Event.")
    assert error.hint == "Track them with isik's track_events or track_history, without append_only=False."


def test_every_model_missing_a_guard_is_named(monkeypatch):
    other = type("Other", (), {"_meta": SimpleNamespace(label="stub.Other")})
    monkeypatch.setattr(checks, "event_models", lambda: [STUB, other])
    monkeypatch.setattr(pgtrigger, "registered", lambda: [])

    (error,) = event_models_are_append_only(app_configs=None)

    assert error.msg == "These event models are not append-only: stub.Event, stub.Other."


def test_a_model_with_no_triggers_at_all_is_named_rather_than_crashed_on(monkeypatch):
    _only_the_stub(monkeypatch, [])

    assert len(event_models_are_append_only(app_configs=None)) == 1


def test_both_guards_and_more_is_append_only(monkeypatch):
    """`<=`, not `<` or `==`: extra triggers on an event table are fine."""
    _only_the_stub(monkeypatch, [*APPEND_ONLY_TRIGGERS, "another"])

    assert event_models_are_append_only(app_configs=None) == []
