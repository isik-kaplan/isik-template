"""Every routed POST either honours an idempotency key or says why it does not.

A POST is where a retry can do the work twice, so it is the line rather than a judgement about which
actions happen to be safe - that judgement would have to be re-made for every action added.
"""

from django.core.checks import Error, register
from isik.django.apps.idempotency.drf import IdempotencyMixin

from apps.common.exemptions import Exemption
from apps.common.urls import routed_callbacks


@register()
def guarded_handlers_honour_a_key_or_say_why_not(app_configs, **kwargs):
    """Checked against the routes rather than the classes: a viewset nobody mounted guards nothing."""
    unguarded = sorted(
        {f"{view.__name__}.{action}" for view, action in _routed_posts() if not _honours_a_key(view, action)}
    )
    if not unguarded:
        return []

    return [
        Error(
            "POST handlers neither honour an idempotency key nor say why not: " + ", ".join(unguarded),
            hint=(
                "Add isik.django.apps.idempotency.drf.IdempotencyMixin, or name the action in "
                "idempotency_exempt_actions with an Exemption(reason) saying it changes nothing."
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
            for view, _ in _routed_posts()
            if issubclass(view, IdempotencyMixin)
            for action, reason in view.idempotency_no_replay_actions.items()
            if not isinstance(reason, Exemption)
        }
    )
    if not bare:
        return []

    return [
        Error(
            "Actions refuse a replay without saying why: " + ", ".join(bare),
            hint="Give each one an Exemption(reason) from apps.common.exemptions.",
            id="{{ cookiecutter.project_slug }}_idempotency.E002",
        )
    ]


def _honours_a_key(view, action):
    if not issubclass(view, IdempotencyMixin):
        return False
    return action not in view.idempotency_exempt_actions or isinstance(
        view.idempotency_exempt_actions[action], Exemption
    )


def _routed_posts():
    """Every mounted viewset action a POST reaches. A plain Django view has no `actions` map and is not
    ours to guard - allauth's headless surface is the whole of that."""
    for callback in routed_callbacks():
        view = getattr(callback, "cls", None)
        for method, action in (getattr(callback, "actions", None) or {}).items():
            if method.lower() == "post" and view is not None:
                yield view, action
