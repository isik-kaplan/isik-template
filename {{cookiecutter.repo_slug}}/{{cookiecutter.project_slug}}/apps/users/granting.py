"""Who may widen what somebody else may do: only what you hold yourself.

Granting is its own right, not implied by `is_staff`, so staff can't quietly promote staff.
"""

from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.permissions import Permission


def may_grant(actor):
    """A superuser, or staff holding `users:grant:rights`."""
    if not (actor and actor.is_authenticated):
        return False
    if actor.is_superuser:
        return True
    return bool(actor.is_staff and actor.has_perm(Permission.USERS_GRANT_RIGHTS))


def refuse_a_grant_beyond_the_giver(actor, *, raising_is_staff=False, raising_is_superuser=False, permissions=()):
    """Names what was asked for rather than what it collided with."""
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
    """`users:grant:rights` does nothing for non-staff, so it is refused rather than stored dormant."""
    if str(Permission.USERS_GRANT_RIGHTS) in {str(name) for name in permissions} and not recipient_is_staff:
        raise ValidationError({"permissions": "Changing what people may do takes effect for staff only."})
