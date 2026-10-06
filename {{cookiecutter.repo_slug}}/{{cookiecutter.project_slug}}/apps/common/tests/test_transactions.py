import inspect
from pathlib import Path
from types import ModuleType

import pytest
from django.conf import settings
from django.db import connection, transaction
from django.urls import path
from django.views import View
from isik.common.utils.exemptions import declared_exemptions
from isik.django.drf.coverage import routed_views

from apps.common.checks import atomicity as checks
from apps.common.transactions import NotAtomicReason, not_atomic


REAL_REASON = "Streams a large export, and holding a transaction open for it would pin every row it reads."
CHECK_ID = "{{ cookiecutter.project_slug }}_common.E001"


def _stand_in(name="view"):
    """A fresh function each time: `non_atomic_requests` marks the one it is given, in place."""

    def view(request):
        return request

    view.__qualname__ = name
    return view


def _routing(monkeypatch, *callbacks):
    """The check walking a urlconf that routes these callables alone, through isik's own walk."""
    urlconf = ModuleType("urlconf")
    urlconf.urlpatterns = [path(f"{position}/", callback) for position, callback in enumerate(callbacks)]
    monkeypatch.setattr(checks, "routed_views", lambda: routed_views(urlconf))


def test_every_request_runs_in_a_transaction():
    """What the rest of this file is an escape hatch from, and what idempotency claims commit inside."""
    assert connection.settings_dict["ATOMIC_REQUESTS"] is True


def test_the_reason_is_kept_on_the_view_for_the_check_to_read():
    view = not_atomic(REAL_REASON)(_stand_in())

    assert view.not_atomic_reason == REAL_REASON
    assert view._non_atomic_requests == {"default"}
    assert view("passed through") == "passed through"


def test_each_use_is_listed_where_it_was_written():
    """`manage.py exemptions` points at the view that opted out, not at this helper."""
    line = inspect.currentframe().f_lineno + 1
    view = not_atomic(REAL_REASON)(_stand_in())

    (made,) = [each for each in declared_exemptions(NotAtomicReason.rule) if each is view.not_atomic_reason]
    assert (made.file, made.line) == (str(Path(__file__).resolve()), line)


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
    _routing(monkeypatch, bare)

    (error,) = checks.views_that_opt_out_of_atomicity_say_why(None)

    assert error.id == CHECK_ID
    assert error.msg == f"Views opt out of ATOMIC_REQUESTS without a reason: {__name__}.view"
    assert error.hint == "Use apps.common.transactions.not_atomic(reason) instead of transaction.non_atomic_requests."


def test_the_check_lists_every_view_rather_than_stopping_at_the_first(monkeypatch):
    """Named out of order, so the listing is exercised as a sorted list with its separator."""
    views = [transaction.non_atomic_requests(_stand_in(name)) for name in ("second", "first")]
    _routing(monkeypatch, *views)

    (error,) = checks.views_that_opt_out_of_atomicity_say_why(None)

    assert error.msg == f"Views opt out of ATOMIC_REQUESTS without a reason: {__name__}.first, {__name__}.second"


def test_the_check_passes_a_view_that_said_why(monkeypatch):
    _routing(monkeypatch, not_atomic(REAL_REASON)(_stand_in()))

    assert checks.views_that_opt_out_of_atomicity_say_why(None) == []


def test_the_check_names_a_view_whose_reason_was_written_by_hand(monkeypatch):
    """Set beside Django's own decorator, a reason skips the floor `not_atomic` holds it to."""
    bare = transaction.non_atomic_requests(_stand_in())
    bare.not_atomic_reason = REAL_REASON
    _routing(monkeypatch, bare)

    (error,) = checks.views_that_opt_out_of_atomicity_say_why(None)

    assert error.msg == f"Views opt out of ATOMIC_REQUESTS without a reason: {__name__}.view"


def test_the_check_passes_an_ordinary_view(monkeypatch):
    _routing(monkeypatch, _stand_in())

    assert checks.views_that_opt_out_of_atomicity_say_why(None) == []


def test_the_walk_reaches_the_surfaces_a_check_is_not_handed():
    """A check is given `ROOT_URLCONF` alone, and django-hosts mounts the admin and auth surfaces
    elsewhere - a walk that read only what it was handed would pass by never looking at them."""
    root_only = {routed.callback.__module__ for routed in routed_views(settings.ROOT_URLCONF)}
    walked = {routed.callback.__module__ for routed in routed_views()}

    assert walked > root_only
    assert any(module.startswith("allauth.headless") for module in walked)
    assert any(module.startswith("django.contrib.admin") for module in walked)


def test_a_class_based_view_is_named_once_and_for_its_class(monkeypatch):
    """isik lists a class-based view once per method it answers; `as_view()`'s own function is
    named after nothing in particular."""

    class Upload(View):
        def get(self, request):
            raise NotImplementedError

        def post(self, request):
            raise NotImplementedError

    _routing(monkeypatch, transaction.non_atomic_requests(Upload.as_view()))

    (error,) = checks.views_that_opt_out_of_atomicity_say_why(None)

    assert error.msg == f"Views opt out of ATOMIC_REQUESTS without a reason: {__name__}.{Upload.__qualname__}"


def test_nothing_currently_opts_out():
    assert checks.views_that_opt_out_of_atomicity_say_why(None) == []
