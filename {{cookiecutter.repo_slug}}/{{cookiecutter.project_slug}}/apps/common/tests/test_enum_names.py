"""The derivation itself, rather than the document it ends up in - a document with no warnings is
true whether the names are right or merely not wrong."""

import pytest
from django.conf import settings

from apps.common import enum_names


class _Meta:
    def __init__(self, fields):
        self._fields = fields

    def get_fields(self):
        return self._fields


class _Field:
    def __init__(self, name, choices=None):
        self.name = name
        self.choices = choices


def _model(name, *fields):
    return type(name, (), {"_meta": _Meta(list(fields))})


def _registry(monkeypatch, *models):
    monkeypatch.setattr(enum_names.django_apps, "get_models", lambda: list(models))


STATUS = [("draft", "Draft"), ("live", "Live")]


def test_a_model_that_carries_pgh_columns_is_a_generated_twin():
    assert enum_names._is_generated(_model("ThingEvent", _Field("pgh_id"), _Field("status", STATUS)))


def test_a_model_we_wrote_is_not():
    assert not enum_names._is_generated(_model("Thing", _Field("status", STATUS)))


def test_the_twin_does_not_count_as_a_second_owner(monkeypatch):
    """The whole reason the exclusion exists: a tracked model and its event table carry the same
    field, so without it no choice set has a sole owner and nothing is ever named."""
    _registry(
        monkeypatch,
        _model("Thing", _Field("status", STATUS)),
        _model("ThingEvent", _Field("pgh_id"), _Field("status", STATUS)),
    )

    assert enum_names.enum_name_overrides() == {"ThingStatus": STATUS}


def test_two_models_owning_one_choice_set_are_left_to_the_generator(monkeypatch):
    _registry(monkeypatch, _model("Thing", _Field("status", STATUS)), _model("Other", _Field("status", STATUS)))

    assert enum_names.enum_name_overrides() == {}


def test_one_model_using_a_choice_set_twice_is_two_owners_too(monkeypatch):
    _registry(monkeypatch, _model("Thing", _Field("status", STATUS), _Field("previous_status", STATUS)))

    assert enum_names.enum_name_overrides() == {}


def test_a_field_with_no_choices_contributes_nothing(monkeypatch):
    _registry(monkeypatch, _model("Thing", _Field("name"), _Field("tags", []), _Field("status", STATUS)))

    assert enum_names.enum_name_overrides() == {"ThingStatus": STATUS}


def test_blank_and_null_are_dropped_before_hashing(monkeypatch):
    """The postprocessing hook drops them before it hashes, so a set that keeps them here hashes to
    something the override can never match - and comes back normalized, since that is what the hook
    will hash."""
    _registry(monkeypatch, _model("Thing", _Field("status", [("", "---"), (None, "-"), *STATUS])))

    assert enum_names.enum_name_overrides() == {"ThingStatus": STATUS}


def test_a_choice_set_that_cannot_be_sorted_is_left_unnamed(monkeypatch):
    """django-celery-beat's timezone field holds values with no ordering between them. Unnamed is
    the fallback, so skipping it costs nothing - raising would cost every other name."""
    unsortable = [(object(), "a"), (object(), "b")]
    _registry(monkeypatch, _model("Thing", _Field("zone", unsortable), _Field("status", STATUS)))

    assert enum_names.enum_name_overrides() == {"ThingStatus": STATUS}


def test_nothing_is_named_when_every_owner_is_generated(monkeypatch):
    _registry(monkeypatch, _model("ThingEvent", _Field("pgh_id"), _Field("status", STATUS)))

    assert enum_names.enum_name_overrides() == {}


@pytest.mark.parametrize(("field", "expected"), [("status", "ThingStatus"), ("signup_method", "ThingSignupMethod")])
def test_the_name_joins_the_model_to_the_field_it_came_from(monkeypatch, field, expected):
    _registry(monkeypatch, _model("Thing", _Field(field, STATUS)))

    assert list(enum_names.enum_name_overrides()) == [expected]


def test_an_ambiguous_set_does_not_stop_the_ones_after_it(monkeypatch):
    """Two distinct sets, the shared one first: a loop that stops rather than skips names nothing
    after it."""
    shared = [("a", "A"), ("b", "B")]
    its_own = [("x", "X"), ("y", "Y")]
    _registry(
        monkeypatch,
        _model("First", _Field("state", shared)),
        _model("Second", _Field("state", shared)),
        _model("Third", _Field("mode", its_own)),
    )

    assert enum_names.enum_name_overrides() == {"ThirdMode": its_own}


def test_ready_hands_the_names_to_drf_spectacular():
    """In `CoreConfig.ready()`, after the registry exists and before spectacular reads its settings."""
    overrides = settings.SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]

    assert overrides == enum_names.enum_name_overrides()
    assert overrides["UserLanguage"] == list(settings.LANGUAGES)
