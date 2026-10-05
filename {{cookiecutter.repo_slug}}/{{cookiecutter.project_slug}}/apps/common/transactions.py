"""The escape hatch from `ATOMIC_REQUESTS`, which takes a reason."""

from django.db import transaction
from isik.common.utils.declared_string import DeclaredString, text
from isik.common.utils.functional import with_attrs


SHORTEST_USEFUL_REASON = 30


class NotAtomicReason(DeclaredString):
    """Reads as the reason itself, so `apps.common.checks.atomicity` sees a plain string."""

    reason = text(min_length=SHORTEST_USEFUL_REASON)


def not_atomic(reason):
    """Run this view outside the request's transaction, and say why.

    `transaction.non_atomic_requests` alone leaves the reason in whatever comment sits above it, which
    is where it stops being true without anything noticing. `apps.common.checks.atomicity` reads what this
    records and refuses a view that opted out without one.
    """
    reason = NotAtomicReason(reason)

    def decorate(view):
        return with_attrs(not_atomic_reason=reason)(transaction.non_atomic_requests(view))

    return decorate
