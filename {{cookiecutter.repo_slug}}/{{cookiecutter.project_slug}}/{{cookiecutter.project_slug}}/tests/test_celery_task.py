import pytest
from amqp.serialization import dumps
from celery import Task
from django.test import RequestFactory
from isik.django.apps.common.middleware import HistoryContextMiddleware
from pghistory.runtime import _tracker

from apps.users.models.user import User
from apps.users.tasks import ping

from {{ cookiecutter.project_slug }} import __version__
from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


HEADER = OnCommitTask.history_context_header


def _while_serving(dispatch, **context):
    """Through the real middleware: the cause is read off the live context, not handed in."""

    class Middleware(HistoryContextMiddleware):
        def get_context(self, request):
            return {**super().get_context(request), **context}

    return Middleware(get_response=lambda request: dispatch())(RequestFactory().post("/ping/"))


def test_ping_runs_synchronously_and_returns_pong(settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True

    assert ping.apply().get() == "pong"


@pytest.mark.django_db
def test_dispatch_waits_for_the_transaction_that_asked_for_it(monkeypatch, django_capture_on_commit_callbacks):
    """Asserts the send, not a registered callback: `on_commit(lambda: None)` registers one too."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append((self.name, a, kw)))

    with django_capture_on_commit_callbacks(execute=True):
        ping.delay(7, flag=True)
        assert sent == [], "dispatched before the transaction it was asked from committed"

    name, positional, options = sent[0]
    assert (name, positional) == ("ping", ((7,), {"flag": True})), "the arguments have to arrive as they were given"


@pytest.mark.django_db
def test_the_options_survive_the_deferral_too(monkeypatch, django_capture_on_commit_callbacks):
    """Only `apply_async` carries options, and dropping them would fail silently."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append((a, kw)))

    with django_capture_on_commit_callbacks(execute=True):
        ping.apply_async((7,), {"flag": True}, countdown=30)

    positional, options = sent[0]
    assert positional == ((7,), {"flag": True})
    assert options["countdown"] == 30


@pytest.mark.django_db
def test_a_task_carries_whoever_asked_for_it(monkeypatch, django_capture_on_commit_callbacks):
    """Committed inside the request, as in production: BaseModel.save()'s atomic closes while the
    context is still open."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    def view():
        with django_capture_on_commit_callbacks(execute=True):
            ping.delay()

    _while_serving(view, user="user-1")

    assert sent[0]["headers"][HEADER] == {"user": "user-1", "caused_by": "request"}


@pytest.mark.django_db
def test_the_cause_survives_the_encoder_that_actually_carries_it(monkeypatch, django_capture_on_commit_callbacks):
    """An AMQP header table refuses a `UUID`, which only a real pk and the real encoder show."""
    user = User.objects.create_user(username="alice", email="alice@example.test", password="x")
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    def view():
        with django_capture_on_commit_callbacks(execute=True):
            ping.delay()

    _while_serving(view, user=user.pk)

    header = sent[0]["headers"][HEADER]
    assert header["user"] == str(user.pk)
    dumps("F", [header])


@pytest.mark.django_db
def test_a_task_nobody_asked_for_says_so_rather_than_naming_nobody(monkeypatch, django_capture_on_commit_callbacks):
    """Otherwise an absent actor and a scheduled one would be the same empty value."""
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    with django_capture_on_commit_callbacks(execute=True):
        ping.delay()

    assert sent[0]["headers"][HEADER] == {"caused_by": "system"}


@pytest.mark.django_db
def test_a_caller_naming_its_own_headers_keeps_them(monkeypatch, django_capture_on_commit_callbacks):
    sent = []
    monkeypatch.setattr(Task, "apply_async", lambda self, *a, **kw: sent.append(kw))

    with django_capture_on_commit_callbacks(execute=True):
        ping.apply_async(headers={"mine": "kept"})

    assert sent[0]["headers"]["mine"] == "kept"
    assert sent[0]["headers"][HEADER] == {"caused_by": "system"}


def test_the_worker_writes_inside_the_context_it_was_given(monkeypatch):
    seen = {}
    monkeypatch.setattr(Task, "__call__", lambda self, *a, **kw: seen.update(_tracker.value.metadata))
    ping.push_request(headers={HEADER: {"user": "user-1", "caused_by": "request"}})

    try:
        ping()
    finally:
        ping.pop_request()

    assert seen == {"user": "user-1", "caused_by": "request", "task": "ping", "version": __version__}


def test_a_worker_given_no_cause_records_the_system(monkeypatch):
    seen = {}
    monkeypatch.setattr(Task, "__call__", lambda self, *a, **kw: seen.update(_tracker.value.metadata))
    ping.push_request(headers=None)

    try:
        ping()
    finally:
        ping.pop_request()

    assert seen["caused_by"] == "system"
