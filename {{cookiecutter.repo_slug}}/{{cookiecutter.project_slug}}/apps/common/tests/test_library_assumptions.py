"""Facts about the stack this project leans on, proven against the real libraries rather than assumed.

Not tests of this project's code: each pins a behavior of Django, allauth, Celery or Postgres that
some piece of this codebase - or an entry in mutation-equivalents.toml - quietly depends on. Proving
one here, once, beats restating it as an assumption in a docstring, and a library upgrade that breaks
it fails here by name instead of somewhere far away.

Add a test here whenever a feature's correctness rests on a library behavior that is not obvious.
A test named by a `verified_by` in mutation-equivalents.toml must make the very call that entry's
reason is about, not a stand-in that happens to look similar.
"""

from types import SimpleNamespace

import pytest
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from celery.local import Proxy
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.http import HttpResponse


class _Watched:
    """Records every attribute read off it, so a test can assert that nothing was read."""

    def __init__(self):
        object.__setattr__(self, "reads", [])

    def __getattribute__(self, name):
        object.__getattribute__(self, "reads").append(name)
        return object.__getattribute__(self, name)


def test_a_response_header_is_case_insensitive():
    """UserLanguageMiddleware writes "Content-Language"; any spelling of it is the same header."""
    for written in ("Content-Language", "content-language", "CONTENT-LANGUAGE"):
        response = HttpResponse()
        response.headers[written] = "tr"

        assert response.headers["Content-Language"] == "tr"
        assert response["content-language"] == "tr"
        assert sum(1 for name in response.headers if name.lower() == "content-language") == 1


def test_populate_user_never_reads_the_request():
    """SocialAccountAdapter.populate_user passes its request straight through to allauth's, which
    only reads `data` and `sociallogin.user` - so what is passed as the request cannot matter."""
    data = {"username": "ada", "email": "ada@example.test", "name": "Ada Lovelace"}
    # The instrument first: an empty record means nothing only if a read would have been recorded.
    probe = _Watched()
    with pytest.raises(AttributeError):
        _ = probe.META
    assert object.__getattribute__(probe, "reads") == ["META"]

    watched = _Watched()
    users = []
    for request in (watched, None):
        user = get_user_model()()
        DefaultSocialAccountAdapter().populate_user(request, SimpleNamespace(user=user), dict(data))
        users.append((user.username, user.email, user.first_name, user.last_name))

    assert object.__getattribute__(watched, "reads") == []
    assert users[0] == users[1] == ("ada", "ada@example.test", "Ada", "Lovelace")


def test_a_shared_task_is_a_proxy_rather_than_the_task_itself():
    """Why mutation-exemptions.toml's OnCommitTask.apply_async entry says mutmut cannot attribute a
    hit there: every call reaches the task through celery.local.Proxy, never by naming it."""
    from apps.users.tasks.health_check import ping

    assert type(ping) is Proxy
    # The proxy answers `__class__` with the task's, which is what hides the indirection.
    assert ping.__class__ is type(ping._get_current_object())


@pytest.mark.django_db(transaction=True)
def test_on_commit_runs_after_the_commit_and_never_after_a_rollback():
    """OnCommitTask dispatches through transaction.on_commit, so a task asked for inside a transaction
    that rolls back must never be sent - and one asked for outside any transaction is sent at once."""
    ran = []

    with pytest.raises(RuntimeError), transaction.atomic():
        transaction.on_commit(lambda: ran.append("rolled back"))
        raise RuntimeError

    with transaction.atomic():
        transaction.on_commit(lambda: ran.append("committed"))
        assert ran == []

    transaction.on_commit(lambda: ran.append("no transaction"))

    assert ran == ["committed", "no transaction"]


@pytest.mark.django_db
def test_postgres_truncates_a_long_identifier_rather_than_refusing_it():
    """Why conftest.py refuses a test database name past 63 characters itself: Postgres would
    silently cut two different long names down to one, and two runs would share a database."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::name = %s::name, length(%s::name)", ["a" * 63 + "x", "a" * 63 + "y", "a" * 70])
        same, length = cursor.fetchone()

    assert same is True
    assert length == 63
