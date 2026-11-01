import pgtrigger
from django.apps import apps
from django.core.checks import Error, register
from isik.django.apps.common.db import APPEND_ONLY_TRIGGERS


def event_models():
    """`pgh_tracked_model` marks a generated event table; pghistory's own views are unmanaged or proxies."""
    return [
        model
        for model in apps.get_models()
        if getattr(model, "pgh_tracked_model", None) is not None and model._meta.managed and not model._meta.proxy
    ]


@register()
def event_models_are_append_only(app_configs, **kwargs):
    """isik allows `append_only=False`; this project doesn't, however the model was tracked."""
    protected = {}
    for model, trigger in pgtrigger.registered():
        protected.setdefault(model, set()).add(trigger.name)
    unprotected = sorted(
        model._meta.label for model in event_models() if not set(APPEND_ONLY_TRIGGERS) <= protected.get(model, set())
    )
    if not unprotected:
        return []
    return [
        Error(
            f"These event models are not append-only: {', '.join(unprotected)}.",
            hint="Track them with isik's track_events or track_history, without append_only=False.",
            id="common.E001",
        )
    ]
