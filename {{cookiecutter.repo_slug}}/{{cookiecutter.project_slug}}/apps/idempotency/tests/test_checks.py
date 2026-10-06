"""The two checks that keep "every POST honours a key" from being a convention.

Driven against stand-in viewsets: the real routes are what `test_nothing_currently_goes_unguarded`
asserts, and a check that could only be exercised by breaking the app is one nobody can read.
"""

import pytest
from isik.django.apps.idempotency import coverage
from isik.django.apps.idempotency.coverage import idempotency_coverage
from isik.django.apps.idempotency.drf import IdempotencyMixin
from isik.django.drf.coverage import RoutedAction
from rest_framework import views, viewsets

from apps.idempotency import checks, schema
from apps.idempotency.exemptions import NoIdempotencyKey, NoReplay
from apps.users.api.viewsets.user import UserViewSet


KEYLESS = NoIdempotencyKey(reason="Answers out of the index and writes nothing, so a retry costs a query.")
UNREPLAYABLE = NoReplay(reason="Hands out a one-time secret, which a replay would hand to whoever asked again.")
PREFIX = "{{ cookiecutter.project_slug }}_idempotency"


class Guarded(IdempotencyMixin, viewsets.ViewSet):
    pass


class Unguarded(viewsets.ViewSet):
    pass


def _routed(monkeypatch, *pairs):
    """isik's walk answering with these POSTs alone, so its own verdict on each is what the check reads."""
    routed = [RoutedAction(f"{view.__name__}/", view, "POST", action) for view, action in pairs]
    monkeypatch.setattr(coverage, "routed_actions", lambda urlconf=None: routed)


def test_a_post_that_honours_no_key_is_named(monkeypatch):
    _routed(monkeypatch, (Unguarded, "create"))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.id == f"{PREFIX}.E001"
    assert error.msg == "POST handlers neither honour an idempotency key nor say why not: Unguarded.create"
    assert error.hint == (
        "Add isik.django.apps.idempotency.drf.IdempotencyMixin, or name the action in "
        "idempotency_exempt_actions with a NoIdempotencyKey(reason=...) saying it changes nothing."
    )


def test_every_unguarded_handler_is_named_rather_than_the_first(monkeypatch):
    _routed(monkeypatch, (Unguarded, "second"), (Unguarded, "first"))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.msg.endswith("Unguarded.first, Unguarded.second")


def test_a_post_on_a_guarded_viewset_passes(monkeypatch):
    _routed(monkeypatch, (Guarded, "create"))

    assert checks.guarded_handlers_honour_a_key_or_say_why_not(None) == []


def test_an_exemption_with_a_reason_passes(monkeypatch):
    class Exempt(Guarded):
        idempotency_exempt_actions = {"search": KEYLESS}

    _routed(monkeypatch, (Exempt, "search"))

    assert checks.guarded_handlers_honour_a_key_or_say_why_not(None) == []


def test_an_exemption_from_another_rule_does_not_excuse_a_post(monkeypatch):
    class Misfiled(Guarded):
        idempotency_exempt_actions = {"search": UNREPLAYABLE}

    _routed(monkeypatch, (Misfiled, "search"))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.msg.endswith("Misfiled.search")


def test_a_reason_too_short_to_be_one_is_not_one(monkeypatch):
    """isik asks only for a reason that is not blank or a placeholder; this project holds the escape hatch to a type."""

    class Bare(Guarded):
        idempotency_exempt_actions = {"search": "because"}

    _routed(monkeypatch, (Bare, "search"))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.msg.endswith("Bare.search")


def test_an_exemption_for_another_action_does_not_cover_this_one(monkeypatch):
    class Elsewhere(Guarded):
        idempotency_exempt_actions = {"search": "because"}

    _routed(monkeypatch, (Elsewhere, "create"))

    assert checks.guarded_handlers_honour_a_key_or_say_why_not(None) == []


def test_a_refused_replay_needs_a_reason_too(monkeypatch):
    class Bare(Guarded):
        idempotency_no_replay_actions = {"create": "because"}

    _routed(monkeypatch, (Bare, "create"))

    (error,) = checks.an_unreplayable_handler_says_what_it_hands_out(None)

    assert error.id == f"{PREFIX}.E002"
    assert error.msg == "Actions refuse a replay without saying why: Bare.create"
    assert error.hint == "Give each one a NoReplay(reason=...) from apps.idempotency.exemptions."


def test_every_refused_replay_is_named_rather_than_the_first(monkeypatch):
    class Bare(Guarded):
        idempotency_no_replay_actions = {"second": "because", "first": "because"}

    _routed(monkeypatch, (Bare, "second"))

    (error,) = checks.an_unreplayable_handler_says_what_it_hands_out(None)

    assert error.msg.endswith("Bare.first, Bare.second")


def test_a_refused_replay_with_a_reason_passes(monkeypatch):
    class Declared(Guarded):
        idempotency_no_replay_actions = {"create": UNREPLAYABLE}

    _routed(monkeypatch, (Declared, "create"))

    assert checks.an_unreplayable_handler_says_what_it_hands_out(None) == []


def test_an_exemption_from_another_rule_does_not_excuse_a_refused_replay(monkeypatch):
    class Misfiled(Guarded):
        idempotency_no_replay_actions = {"create": KEYLESS}

    _routed(monkeypatch, (Misfiled, "create"))

    (error,) = checks.an_unreplayable_handler_says_what_it_hands_out(None)

    assert error.msg.endswith("Misfiled.create")


def test_an_unguarded_viewset_is_not_asked_for_replay_reasons(monkeypatch):
    """It has no `idempotency_no_replay_actions` to read - E001 is what names it."""
    _routed(monkeypatch, (Unguarded, "create"))

    assert checks.an_unreplayable_handler_says_what_it_hands_out(None) == []


def test_a_plain_api_view_is_named_by_the_method_it_answers(monkeypatch):
    class Endpoint(views.APIView):
        pass

    _routed(monkeypatch, (Endpoint, None))

    (error,) = checks.guarded_handlers_honour_a_key_or_say_why_not(None)

    assert error.msg.endswith("Endpoint.POST")


def test_the_walk_reaches_the_users_post_on_its_own_host():
    """isik walks every urlconf django-hosts serves; the users endpoint lives on the api host."""
    routed = {(entry.routed.view, entry.routed.action) for entry in idempotency_coverage()}

    assert (UserViewSet, "create") in routed
    assert (UserViewSet, "list") not in routed


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
