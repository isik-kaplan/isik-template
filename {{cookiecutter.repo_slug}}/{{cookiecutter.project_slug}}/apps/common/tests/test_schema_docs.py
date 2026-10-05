"""Saying nothing, explicitly."""

from types import SimpleNamespace

import pytest
from django.core import checks as django_checks
from django.db import models

from apps.common.checks import schema_docs as checks
from apps.common.schema_docs import NoComment, NoHelpText


REASON = "Named for what it points at, and the caller just read the row it names."


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_it_is_empty_to_everything_that_reads_it(sentinel):
    """Django writes it to the column and drf-spectacular publishes it, so a sentinel that rendered
    would leak into both."""
    assert sentinel(REASON) == ""


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_the_reason_is_kept_where_the_check_looks(sentinel):
    assert sentinel(REASON).reason == REASON


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_a_placeholder_is_not_a_reason(sentinel):
    with pytest.raises(ValueError, match="at least 40 characters"):
        sentinel("n/a")


@pytest.mark.parametrize("sentinel", [NoHelpText, NoComment])
def test_it_deconstructs_as_itself(sentinel):
    """Written out as the empty string it equals, the migration state rebuilds `help_text`'s own
    default and `makemigrations` asks for the same change forever."""
    path, args, kwargs = sentinel(REASON).deconstruct()

    assert path == f"apps.common.schema_docs.{sentinel.__name__}"
    assert (args, kwargs) == ((REASON,), {})


def _column(name, **kwargs):
    field = models.CharField(**kwargs)
    field.name = name
    return field


def _model(*fields, label="somewhere.Model", proxy=False, tracked=None, module="apps.somewhere"):
    """Enough of a model for the walk; `object` ends the mro with no `_meta` to inherit from."""
    stand_in = type("Model", (), {"__module__": module, "pgh_tracked_model": tracked})
    stand_in._meta = SimpleNamespace(label=label, proxy=proxy, local_fields=fields, abstract=False, fields=fields)
    return stand_in


def _declared(monkeypatch, *models_):
    monkeypatch.setattr(checks.apps, "get_models", lambda: list(models_))
    return [f"{where}.{field.name}" for where, field in checks._fields_we_write()]


def _errors_for(monkeypatch, *fields):
    monkeypatch.setattr(checks, "_fields_we_write", lambda: [("somewhere.Model", field) for field in fields])
    return checks.every_field_says_what_it_is_or_why_it_does_not(None)


def test_the_check_names_a_field_that_says_neither(monkeypatch):
    (error,) = _errors_for(monkeypatch, _column("bare"))

    assert error.level == django_checks.ERROR
    assert error.id == "schema_docs.E001"
    assert error.msg == (
        "Fields say nothing and do not say why: somewhere.Model.bare (db_comment), somewhere.Model.bare (help_text)"
    )
    assert error.hint == "Give it one, or NoHelpText(reason) / NoComment(reason) from apps.common.schema_docs."


def test_the_check_names_the_half_that_is_missing(monkeypatch):
    """Two readers, so one of them being served is not the other one being served."""
    (error,) = _errors_for(monkeypatch, _column("half", help_text="What it is.", db_comment=None))

    assert error.msg == "Fields say nothing and do not say why: somewhere.Model.half (db_comment)"


def test_the_check_lists_every_field_rather_than_stopping_at_the_first(monkeypatch):
    """Named out of order, so the listing is exercised as a sorted list with its separator."""
    (error,) = _errors_for(monkeypatch, *(_column(name, db_comment="A column.") for name in ("second", "first")))

    assert error.msg == (
        "Fields say nothing and do not say why: somewhere.Model.first (help_text), somewhere.Model.second (help_text)"
    )


def test_the_check_passes_a_field_that_said_why_it_says_nothing(monkeypatch):
    said = _column("quiet", help_text=NoHelpText(REASON), db_comment=NoComment(REASON))

    assert _errors_for(monkeypatch, said) == []


def test_the_check_passes_a_field_that_says_what_it_is(monkeypatch):
    assert _errors_for(monkeypatch, _column("said", help_text="What it is.", db_comment="What it holds.")) == []


def test_the_check_is_registered():
    """Registered on import from CoreConfig.ready(), which is the only thing that makes it run."""
    assert checks.every_field_says_what_it_is_or_why_it_does_not in django_checks.registry.registry.get_checks()


def test_every_field_this_project_declares_currently_says_something():
    assert checks.every_field_says_what_it_is_or_why_it_does_not(None) == []


def test_a_column_django_made_for_us_is_not_ours_to_describe(monkeypatch):
    assert _declared(monkeypatch, _model(_column("id", auto_created=True), _column("name"))) == ["somewhere.Model.name"]


def test_a_proxy_declares_no_column_of_its_own(monkeypatch):
    assert _declared(monkeypatch, _model(_column("name"), proxy=True)) == []


def test_an_event_table_is_not_ours_to_describe(monkeypatch):
    """pghistory mirrors the tracked model's columns, comments included, so there is no line of ours
    to hang a reason on."""
    assert _declared(monkeypatch, _model(_column("name"), tracked=object())) == []


def test_a_third_party_model_is_not_ours_to_describe(monkeypatch):
    assert _declared(monkeypatch, _model(_column("name"), module="allauth.account.models")) == []


@pytest.mark.parametrize(
    "skipped",
    [{"proxy": True}, {"tracked": object()}, {"module": "allauth.account.models"}],
    ids=["proxy", "event table", "third party"],
)
def test_a_model_that_is_skipped_does_not_end_the_walk(monkeypatch, skipped):
    """Skipped first, so a walk that stopped there rather than moving on would name nothing after it."""
    assert _declared(monkeypatch, _model(_column("skipped"), **skipped), _model(_column("name"))) == [
        "somewhere.Model.name"
    ]


def test_a_field_inherited_from_a_third_party_base_is_not_ours_to_describe():
    """`AbstractUser` brings `password` and a dozen others into our table with nothing of ours to
    hang a reason on, while `language` beside it is declared here and so is."""
    declared = {f"{where}.{field.name}" for where, field in checks._fields_we_write()}

    assert "users.User.password" not in declared
    assert "users.User.created_at" not in declared
    assert "users.User.language" in declared


def test_a_field_on_our_own_abstract_base_is_named_for_the_base():
    """One line on `BaseModel` serves every model under it, so it is listed once under that name
    rather than once per table."""
    declared = {where for where, field in checks._fields_we_write() if field.name == "id"}

    assert declared == {"BaseModel"}
