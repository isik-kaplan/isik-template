import pytest
from celery import Task
from django.test import RequestFactory
from isik.django.apps.common.middleware import HistoryContextMiddleware
from pghistory.runtime import _tracker

from apps.users.tasks import ping
from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


HEADER = OnCommitTask.history_context_header


def _while_serving(dispatch, **context):
    """Runs `dispatch` as the view of a request served through the middleware that opens the context.

    The cause is read off the live context rather than handed in, so nothing short of a served
    request proves a dispatch picks it up.
    """

    class Middleware(HistoryContextMiddleware):
        def get_context(self, request):
            return {**super().get_context(request), **context}

    return Middleware(get_response=lambda request: dispatch())(RequestFactory().post("/ping/"))


def test_ping_runs_synchronously_and_returns_pong(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True

    assert ping.apply().get() == "pong"


@pytest.mark.django_db
def test_dispatch_waits_for_the_transaction_that_asked_for_it(monkeypatch, django_capture_on_commit_callbacks):
    """A task picked up before its caller commits reads a row that is not there yet, so nothing is
    sent until the transaction is. `delay` returns nothing for the same reason - there is no result
    to hand back for a task that has not been sent.

    What is asserted is the send, not that a callback was registered: `on_commit(lambda: None)`
    registers one too, and passed this test until it did.
    """
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append((self.name, a, kw)))

    with django_capture_on_commit_callbacks(execute=True):
        assert ping.delay(7, flag=True) is None
        assert sent == [], "dispatched before the transaction it was asked from committed"

    name, positional, options = sent[0]
    assert (name, positional) == ("ping", ((7,), {"flag": True})), "the arguments have to arrive as they were given"


@pytest.mark.django_db
def test_the_options_survive_the_deferral_too(monkeypatch, django_capture_on_commit_callbacks):
    """`delay` carries no options, so only a direct `apply_async` reaches them - and a forward that
    drops them loses a countdown or a queue with nothing to say so."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append((a, kw)))

    with django_capture_on_commit_callbacks(execute=True):
        ping.apply_async((7,), {"flag": True}, countdown=30)

    positional, options = sent[0]
    assert positional == ((7,), {"flag": True})
    assert options["countdown"] == 30


@pytest.mark.django_db
def test_a_task_carries_whoever_asked_for_it(monkeypatch, django_capture_on_commit_callbacks):
    """Dispatch reads the request's own context, so a row the worker writes names the person whose
    click caused it rather than nobody. Committed inside the request rather than around it, which is
    where it lands in production: a write inside the view runs through BaseModel.save()'s own
    transaction.atomic, which closes while the request - and so the context - is still open."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    def view():
        with django_capture_on_commit_callbacks(execute=True):
            ping.delay()

    _while_serving(view, user="user-1")

    assert sent[0]["headers"][HEADER] == {"user": "user-1", "caused_by": "request"}


@pytest.mark.django_db
def test_a_task_nobody_asked_for_says_so_rather_than_naming_nobody(monkeypatch, django_capture_on_commit_callbacks):
    """A beat task has no request behind it. Marked as the system's, because an absent actor and a
    scheduled one would otherwise be the same empty value."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    with django_capture_on_commit_callbacks(execute=True):
        ping.delay()

    assert sent[0]["headers"][HEADER] == {"caused_by": "system"}


@pytest.mark.django_db
def test_a_caller_naming_its_own_headers_keeps_them(monkeypatch, django_capture_on_commit_callbacks):
    """The cause is added to a caller's headers rather than replacing them."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    with django_capture_on_commit_callbacks(execute=True):
        ping.apply_async(headers={"mine": "kept"})

    assert sent[0]["headers"]["mine"] == "kept"
    assert sent[0]["headers"][HEADER] == {"caused_by": "system"}


def test_the_worker_writes_inside_the_context_it_was_given(monkeypatch):
    """The worker half: the cause off the message becomes the context every row it writes carries,
    with the task's own name added - a person's click and a worker acting on it are different
    claims."""
    seen = {}
    monkeypatch.setattr(Task, "__call__", lambda self, *a, **kw: seen.update(_tracker.value.metadata))
    ping.push_request(headers={HEADER: {"user": "user-1", "caused_by": "request"}})

    try:
        ping()
    finally:
        ping.pop_request()

    assert seen == {"user": "user-1", "caused_by": "request", "task": "ping"}


def test_a_worker_given_no_cause_records_the_system(monkeypatch):
    """A message sent before this existed, or by anything that does not set the header."""
    seen = {}
    monkeypatch.setattr(Task, "__call__", lambda self, *a, **kw: seen.update(_tracker.value.metadata))
    ping.push_request(headers=None)

    try:
        ping()
    finally:
        ping.pop_request()

    assert seen["caused_by"] == "system"
