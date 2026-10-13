"""Who may widen what somebody else may do.

One rule underneath all of it: **you may grant something only if you hold it yourself**. A superuser holds
every permission already, so "a superuser may grant anything" needs no special case, and nothing can be
created from nothing by somebody who never had it.

Granting is its own right rather than something `is_staff` implies, because staff promoting staff is a
quiet way for the set of people who can change settings to grow with nobody deciding to.
"""

from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.permissions import Permission


def may_grant(actor):
    """A superuser may, by holding everything. Anybody else needs the permission *and* staff: the string
    alone does nothing for somebody who may not change administrative settings at all."""
    if not (actor and actor.is_authenticated):
        return False
    if actor.is_superuser:
        return True
    return bool(actor.is_staff and actor.has_perm(Permission.USERS_GRANT_RIGHTS))


def refuse_a_grant_beyond_the_giver(actor, *, raising_is_staff=False, raising_is_superuser=False, permissions=()):
    """Refused before the write, naming what was asked for rather than what it collided with."""
    if not (raising_is_staff or raising_is_superuser or permissions):
        return
    if not may_grant(actor):
        raise PermissionDenied("You cannot change what other people may do.")
    if raising_is_superuser and not actor.is_superuser:
        raise ValidationError({"is_superuser": "You cannot make somebody a superuser."})
    beyond = sorted({str(name) for name in permissions} - actor.get_all_permissions())
    if beyond:
        raise ValidationError({"permissions": f"You do not hold these yourself: {', '.join(beyond)}."})


def refuse_a_grant_that_can_never_apply(recipient_is_staff, permissions):
    """`users:grant:rights` does nothing for somebody who is not staff, so granting it to them is refused
    rather than stored dormant - a permission list should not overstate what somebody can do."""
    if str(Permission.USERS_GRANT_RIGHTS) in {str(name) for name in permissions} and not recipient_is_staff:
        raise ValidationError({"permissions": "Changing what people may do takes effect for staff only."})
