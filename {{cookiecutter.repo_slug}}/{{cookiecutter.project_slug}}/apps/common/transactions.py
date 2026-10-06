"""The escape hatch from `ATOMIC_REQUESTS`, which takes a reason."""

from django.db import transaction
from isik.common.utils.exemptions import exemption_class, makes_exemption
from isik.common.utils.functional import with_attrs


NotAtomicReason = exemption_class(
    "NotAtomicReason",
    rule="transactions.atomic-requests",
    why="Every request runs in one transaction, so one that fails half way leaves nothing half written.",
    min_length=30,
)


@makes_exemption(NotAtomicReason)
def not_atomic(reason):
    """Run this view outside the request's transaction, and say why.

    `transaction.non_atomic_requests` alone leaves the reason in whatever comment sits above it, which
    is where it stops being true without anything noticing. `apps.common.checks.atomicity` reads what this
    records and refuses a view that opted out without one.
    """
    reason = NotAtomicReason(reason=reason)

    def decorate(view):
        return with_attrs(not_atomic_reason=reason)(transaction.non_atomic_requests(view))

    return decorate
