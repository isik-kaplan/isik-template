"""The two checks that keep "every POST honours a key" from being a convention.

Driven against stand-in viewsets: the real routes are what `test_nothing_currently_goes_unguarded`
asserts, and a check that could only be exercised by breaking the app is one nobody can read.
"""

import pytest
from isik.django.apps.idempotency.drf import IdempotencyMixin
from rest_framework import viewsets

from apps.common.exemptions import Exemption
from apps.idempotency import checks, schema
from apps.users.api.viewsets.user import UserViewSet


REASON = Exemption("Answers out of the index and writes nothing, so a retry costs a query.")
PREFIX = "{{ cookiecutter.project_slug }}_idempotency"


class Guarded(IdempotencyMixin, viewsets.ViewSet):
    pass


class Unguarded(viewsets.ViewSet):
    pass


def _routed(*pairs):
    return lambda: list(pairs)


def test_a_post_that_honours_no_key_is_named(monkeypatch):
    monkeypatch.setattr(checks, "_routed_posts", _routed((Unguarded, "create")))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.id == f"{PREFIX}.E001"
    assert error.msg == "POST handlers neither honour an idempotency key nor say why not: Unguarded.create"
    assert error.hint == (
        "Add isik.django.apps.idempotency.drf.IdempotencyMixin, or name the action in "
        "idempotency_exempt_actions with an Exemption(reason) saying it changes nothing."
    )


def test_every_unguarded_handler_is_named_rather_than_the_first(monkeypatch):
    monkeypatch.setattr(checks, "_routed_posts", _routed((Unguarded, "second"), (Unguarded, "first")))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.msg.endswith("Unguarded.first, Unguarded.second")


def test_a_post_on_a_guarded_viewset_passes(monkeypatch):
    monkeypatch.setattr(checks, "_routed_posts", _routed((Guarded, "create")))

    assert checks.guarded_handlers_honour_a_key_or_say_why_not(None) == []


def test_an_exemption_with_a_reason_passes(monkeypatch):
    class Exempt(Guarded):
        idempotency_exempt_actions = {"search": REASON}

    monkeypatch.setattr(checks, "_routed_posts", _routed((Exempt, "search")))

    assert checks.guarded_handlers_honour_a_key_or_say_why_not(None) == []


def test_a_reason_too_short_to_be_one_is_not_one(monkeypatch):
    """isik asks only for a non-empty string; this project holds every escape hatch to an Exemption."""

    class Bare(Guarded):
        idempotency_exempt_actions = {"search": "because"}

    monkeypatch.setattr(checks, "_routed_posts", _routed((Bare, "search")))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.msg.endswith("Bare.search")


def test_an_exemption_for_another_action_does_not_cover_this_one(monkeypatch):
    class Elsewhere(Guarded):
        idempotency_exempt_actions = {"search": "because"}

    monkeypatch.setattr(checks, "_routed_posts", _routed((Elsewhere, "create")))

    assert checks.guarded_handlers_honour_a_key_or_say_why_not(None) == []


def test_a_refused_replay_needs_a_reason_too(monkeypatch):
    class Bare(Guarded):
        idempotency_no_replay_actions = {"create": "because"}

    monkeypatch.setattr(checks, "_routed_posts", _routed((Bare, "create")))

    (error,) = checks.an_unreplayable_handler_says_what_it_hands_out(None)

    assert error.id == f"{PREFIX}.E002"
    assert error.msg == "Actions refuse a replay without saying why: Bare.create"
    assert error.hint == "Give each one an Exemption(reason) from apps.common.exemptions."


def test_every_refused_replay_is_named_rather_than_the_first(monkeypatch):
    class Bare(Guarded):
        idempotency_no_replay_actions = {"second": "because", "first": "because"}

    monkeypatch.setattr(checks, "_routed_posts", _routed((Bare, "second")))

    (error,) = checks.an_unreplayable_handler_says_what_it_hands_out(None)

    assert error.msg.endswith("Bare.first, Bare.second")


def test_a_refused_replay_with_a_reason_passes(monkeypatch):
    class Declared(Guarded):
        idempotency_no_replay_actions = {"create": REASON}

    monkeypatch.setattr(checks, "_routed_posts", _routed((Declared, "create")))

    assert checks.an_unreplayable_handler_says_what_it_hands_out(None) == []


def test_an_unguarded_viewset_is_not_asked_for_replay_reasons(monkeypatch):
    """It has no `idempotency_no_replay_actions` to read - E001 is what names it."""
    monkeypatch.setattr(checks, "_routed_posts", _routed((Unguarded, "create")))

    assert checks.an_unreplayable_handler_says_what_it_hands_out(None) == []


def test_the_walk_finds_the_routed_posts_and_only_those():
    """`create` is the users endpoint's one POST; its GET-only actions and allauth's plain views
    (no `actions` map) are not this check's to guard."""
    routed = set(checks._routed_posts())

    assert (UserViewSet, "create") in routed
    assert (UserViewSet, "list") not in routed
    assert all(view is not None for view, _ in routed)


@pytest.mark.parametrize(
    "check",
    [checks.guarded_handlers_honour_a_key_or_say_why_not, checks.an_unreplayable_handler_says_what_it_hands_out],
    ids=lambda value: value.__name__,
)
def test_nothing_currently_goes_unguarded(check):
    assert check(None) == []


def test_every_post_in_the_document_declares_the_header():
    """Published once by a hook, so a POST added later inherits it - and the generated clients refuse
    a call without one."""
    # A path with no POST first, so one does not end the walk before the POSTs after it.
    document = {
        "paths": {
            "/c/": {"get": {}},
            "/a/": {"post": {"parameters": [{"name": "id"}]}, "get": {}},
            "/b/": {"post": {}},
        }
    }

    result = schema.every_post_declares_the_key(document, None, None, True)

    assert [one["name"] for one in result["paths"]["/a/"]["post"]["parameters"]] == [
        "id",
        IdempotencyMixin.idempotency_header,
    ]
    assert result["paths"]["/b/"]["post"]["parameters"] == [schema.PARAMETER]
    assert "parameters" not in result["paths"]["/c/"]["get"]


def test_a_document_with_no_paths_passes_through():
    assert schema.every_post_declares_the_key({}, None, None, True) == {}


def test_declaring_it_twice_replaces_rather_than_appends():
    once = schema.every_post_declares_the_key({"paths": {"/a/": {"post": {}}}}, None, None, True)
    twice = schema.every_post_declares_the_key(once, None, None, True)

    assert twice["paths"]["/a/"]["post"]["parameters"] == [schema.PARAMETER]


def test_the_header_is_declared_required():
    """The server answers 400 without it, so a document calling it optional describes another server."""
    assert schema.PARAMETER["required"] is True
    assert schema.PARAMETER["in"] == "header"
    assert schema.PARAMETER["schema"] == {"type": "string", "format": "uuid"}


@pytest.mark.django_db
def test_the_published_document_declares_it_on_the_users_post(client):
    """The hook is wired into SPECTACULAR_SETTINGS, not just importable."""
    document = client.get("/v0/schema/?format=json").json()

    parameters = document["paths"]["/v0/users/"]["post"]["parameters"]
    assert schema.PARAMETER in parameters
