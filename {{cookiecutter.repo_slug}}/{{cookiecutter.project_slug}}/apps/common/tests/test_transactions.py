import pytest
from django.conf import settings
from django.db import connection, transaction
from django.urls import get_resolver

from apps.common.checks import atomicity as checks
from apps.common.transactions import not_atomic
from apps.common.urls import _callbacks, routed_callbacks


REAL_REASON = "Streams a large export, and holding a transaction open for it would pin every row it reads."
CHECK_ID = "{{ cookiecutter.project_slug }}_common.E001"


def _stand_in(name="view"):
    """A fresh function each time: `non_atomic_requests` marks the one it is given, in place."""

    def view(request):
        return request

    view.__qualname__ = name
    return view


def test_every_request_runs_in_a_transaction():
    """What the rest of this file is an escape hatch from, and what idempotency claims commit inside."""
    assert connection.settings_dict["ATOMIC_REQUESTS"] is True


def test_the_reason_is_kept_on_the_view_for_the_check_to_read():
    view = not_atomic(REAL_REASON)(_stand_in())

    assert view.not_atomic_reason == REAL_REASON
    assert view._non_atomic_requests == {"default"}
    assert view("passed through") == "passed through"


@pytest.mark.parametrize("reason", ["", "n/a", "TODO", "not needed", "because"])
def test_a_reason_that_explains_nothing_is_refused_where_it_is_written(reason):
    """At import rather than in the check: a decorator that accepted it would leave the view running
    outside a transaction until somebody ran the checks."""
    with pytest.raises(ValueError, match="needs a reason"):
        not_atomic(reason)


def test_the_reason_is_stored_without_the_whitespace_it_arrived_with():
    """The check reads it back, so it has to be stored the way it was measured."""
    view = not_atomic(f"   {REAL_REASON}   ")(_stand_in())

    assert view.not_atomic_reason == REAL_REASON


def test_the_refusal_names_what_was_offered():
    with pytest.raises(ValueError, match="'too short'"):
        not_atomic("too short")


def test_the_bar_is_a_floor_rather_than_one_character_above_it():
    """Lengths written out rather than measured from the constant, which would move with it."""
    with pytest.raises(ValueError):
        not_atomic("x" * 29)

    assert not_atomic("x" * 30)(_stand_in()).not_atomic_reason


def test_the_check_names_a_view_that_opted_out_without_saying_why(monkeypatch):
    bare = transaction.non_atomic_requests(_stand_in())
    monkeypatch.setattr(checks, "routed_callbacks", lambda: [bare])

    (error,) = checks.views_that_opt_out_of_atomicity_say_why(None)

    assert error.id == CHECK_ID
    assert error.msg == f"Views opt out of ATOMIC_REQUESTS without a reason: {__name__}.view"
    assert error.hint == "Use apps.common.transactions.not_atomic(reason) instead of transaction.non_atomic_requests."


def test_the_check_lists_every_view_rather_than_stopping_at_the_first(monkeypatch):
    """Named out of order, so the listing is exercised as a sorted list with its separator."""
    views = [transaction.non_atomic_requests(_stand_in(name)) for name in ("second", "first")]
    monkeypatch.setattr(checks, "routed_callbacks", lambda: views)

    (error,) = checks.views_that_opt_out_of_atomicity_say_why(None)

    assert error.msg == f"Views opt out of ATOMIC_REQUESTS without a reason: {__name__}.first, {__name__}.second"


def test_the_check_passes_a_view_that_said_why(monkeypatch):
    monkeypatch.setattr(checks, "routed_callbacks", lambda: [not_atomic(REAL_REASON)(_stand_in())])

    assert checks.views_that_opt_out_of_atomicity_say_why(None) == []


def test_the_check_passes_an_ordinary_view(monkeypatch):
    monkeypatch.setattr(checks, "routed_callbacks", lambda: [_stand_in()])

    assert checks.views_that_opt_out_of_atomicity_say_why(None) == []


def test_the_walk_reaches_the_surfaces_a_check_is_not_handed():
    """A check is given `ROOT_URLCONF` alone, and django-hosts mounts the admin and auth surfaces
    elsewhere - a walk that read only what it was handed would pass by never looking at them."""
    root_only = {view.__module__ for view in _callbacks(get_resolver(settings.ROOT_URLCONF))}
    walked = {view.__module__ for view in routed_callbacks()}

    assert walked > root_only
    assert any(module.startswith("allauth.headless") for module in walked)
    assert any(module.startswith("django.contrib.admin") for module in walked)


def test_nothing_currently_opts_out():
    assert checks.views_that_opt_out_of_atomicity_say_why(None) == []
