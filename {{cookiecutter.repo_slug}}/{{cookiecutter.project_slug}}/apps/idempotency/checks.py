"""Every routed POST either honours an idempotency key or says why it does not.

A POST is where a retry can do the work twice, so it is the line rather than a judgement about which
actions happen to be safe - that judgement would have to be re-made for every action added.
"""

from django.core.checks import Error, register
from isik.django.apps.idempotency.coverage import idempotency_coverage
from isik.django.apps.idempotency.drf import IdempotencyMixin
from isik.django.drf.coverage import CoverageStatus

from apps.idempotency.exemptions import NoIdempotencyKey, NoReplay


@register()
def guarded_handlers_honour_a_key_or_say_why_not(app_configs, **kwargs):
    """Checked against the routes rather than the classes: a viewset nobody mounted guards nothing."""
    unguarded = sorted({_named(entry.routed) for entry in idempotency_coverage() if not _honours_a_key(entry)})
    if not unguarded:
        return []

    return [
        Error(
            "POST handlers neither honour an idempotency key nor say why not: " + ", ".join(unguarded),
            hint=(
                "Add isik.django.apps.idempotency.drf.IdempotencyMixin, or name the action in "
                "idempotency_exempt_actions with a NoIdempotencyKey(reason=...) saying it changes nothing."
            ),
            id="{{ cookiecutter.project_slug }}_idempotency.E001",
        )
    ]


@register()
def an_unreplayable_handler_says_what_it_hands_out(app_configs, **kwargs):
    """`idempotency_no_replay_actions` refuses a caller an answer they may have lost, so the reason has
    to be written where the refusal is."""
    bare = sorted(
        {
            f"{view.__name__}.{action}"
            for view in {entry.routed.view for entry in idempotency_coverage()}
            if issubclass(view, IdempotencyMixin)
            for action, reason in view.idempotency_no_replay_actions.items()
            if not isinstance(reason, NoReplay)
        }
    )
    if not bare:
        return []

    return [
        Error(
            "Actions refuse a replay without saying why: " + ", ".join(bare),
            hint="Give each one a NoReplay(reason=...) from apps.idempotency.exemptions.",
            id="{{ cookiecutter.project_slug }}_idempotency.E002",
        )
    ]


def _named(routed):
    # A plain APIView has no action, only the method it answers.
    return f"{routed.view.__name__}.{routed.action or routed.method}"


def _honours_a_key(entry):
    if entry.status is CoverageStatus.EXEMPT:
        return isinstance(entry.reason, NoIdempotencyKey)
    return entry.status is CoverageStatus.COVERED
