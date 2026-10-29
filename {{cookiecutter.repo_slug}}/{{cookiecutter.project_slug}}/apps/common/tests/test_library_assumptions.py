"""Library behaviours this codebase or mutation-equivalents.toml depends on, proven against the real thing.

A test named by a `verified_by` must make the very call its entry's reason is about, not a stand-in.
"""

from types import SimpleNamespace

import pytest
from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from celery.local import Proxy
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import connection, models, transaction
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
    """allauth's populate_user reads only `data` and `sociallogin.user`, so the request cannot matter."""
    data = {"username": "ada", "email": "ada@example.test", "name": "Ada Lovelace"}
    # Prove the probe records reads first, or an empty record means nothing.
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


def test_save_user_never_reads_the_request():
    """allauth's save_user hands the request only to populate_username, which never reads it."""
    data = {"username": "ada", "email": "ada@example.test", "password1": "correct horse battery staple"}
    watched = _Watched()
    users = []
    for request in (watched, None):
        user = get_user_model()()
        DefaultAccountAdapter().save_user(request, user, SimpleNamespace(cleaned_data=dict(data)), commit=False)
        users.append((user.username, user.email, user.has_usable_password()))

    assert object.__getattribute__(watched, "reads") == []
    assert users[0] == users[1] == ("ada", "ada@example.test", True)


def test_a_shared_task_is_a_proxy_rather_than_the_task_itself():
    """Why mutmut cannot attribute OnCommitTask.apply_async hits: calls go through celery.local.Proxy."""
    from apps.users.tasks.health_check import ping

    assert type(ping) is Proxy
    # The proxy answers `__class__` with the task's, which is what hides the indirection.
    assert ping.__class__ is type(ping._get_current_object())


@pytest.mark.django_db(transaction=True)
def test_on_commit_runs_after_the_commit_and_never_after_a_rollback():
    """OnCommitTask relies on this: a rolled-back task is never sent, one outside a transaction at once."""
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
    """Why conftest.py refuses long test database names: Postgres would cut two names down to one."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::name = %s::name, length(%s::name)", ["a" * 63 + "x", "a" * 63 + "y", "a" * 70])
        same, length = cursor.fetchone()

    assert same is True
    assert length == 63


def test_a_model_reference_is_case_insensitive():
    """kind_key() points at "notifications.NoticeKindPolicy"; any spelling of it is the same model and field."""
    spellings = ("notifications.NoticeKindPolicy", "notifications.noticekindpolicy")

    assert apps.get_model(spellings[0]) is apps.get_model(spellings[1])
    first, second = (models.ForeignKey(name, on_delete=models.PROTECT).deconstruct() for name in spellings)
    assert first == second
