from django.core.checks import Error, register

from apps.common.urls import routed_callbacks


@register()
def views_that_opt_out_of_atomicity_say_why(app_configs, **kwargs):
    """`ATOMIC_REQUESTS` is on, so a view outside a transaction is a decision somebody took.

    Django's own `non_atomic_requests` records no reason, so a view marked with it directly is
    indistinguishable from one marked by accident. `apps.common.transactions.not_atomic` keeps one.
    """
    unexplained = sorted(
        f"{view.__module__}.{view.__qualname__}"
        for view in routed_callbacks()
        if getattr(view, "_non_atomic_requests", None) and not getattr(view, "not_atomic_reason", None)
    )
    if not unexplained:
        return []

    return [
        Error(
            "Views opt out of ATOMIC_REQUESTS without a reason: " + ", ".join(unexplained),
            hint="Use apps.common.transactions.not_atomic(reason) instead of transaction.non_atomic_requests.",
            id="{{ cookiecutter.project_slug }}_common.E001",
        )
    ]
