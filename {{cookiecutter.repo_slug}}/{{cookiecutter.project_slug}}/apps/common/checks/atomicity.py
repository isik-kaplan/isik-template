from django.core.checks import Error, register
from isik.django.drf.coverage import routed_views

from apps.common.transactions import NotAtomicReason


@register()
def views_that_opt_out_of_atomicity_say_why(app_configs, **kwargs):
    """`ATOMIC_REQUESTS` is on, so a view outside a transaction is a decision somebody took.

    Django's own `non_atomic_requests` records no reason, so a view marked with it directly is
    indistinguishable from one marked by accident. `apps.common.transactions.not_atomic` keeps one.
    """
    # Read off the routed callable: a decorator around `as_view()` in a urlconf marks that alone.
    unexplained = sorted(
        {
            _named(view)
            for view in (routed.callback for routed in routed_views())
            if getattr(view, "_non_atomic_requests", None)
            and not isinstance(getattr(view, "not_atomic_reason", None), NotAtomicReason)
        }
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


def _named(view):
    """A class-based view by its class, since `as_view()`'s own function is named after nothing."""
    named = getattr(view, "view_class", view)
    return f"{named.__module__}.{named.__qualname__}"
