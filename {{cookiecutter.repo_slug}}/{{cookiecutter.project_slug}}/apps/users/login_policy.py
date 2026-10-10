"""Who the login ladder still admits, and signing out everybody it does not.

The sweep is what makes enforcing this at sign-in enough. An existing session never signs in again,
so without it the setting would be a lie for as long as the longest session lives - which during an
incident is the opposite of what it is for.
"""

from itertools import product

from allauth.usersessions.models import UserSession
from django.contrib.sessions.models import Session
from django.db.models import Q
from django.utils import timezone

from apps.common.logging import LOGIN_POLICY_SWEPT, LOGIN_REFUSED_BY_POLICY, audit, log
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User


def admits(user, policy):
    """Whether this person may sign in under `policy`."""
    return SiteSettings.LoginPolicy.admits(policy, is_staff=user.is_staff, is_superuser=user.is_superuser)


def admits_signing_in(user):
    """`admits()` for a sign-in attempt, leaving a record of each one it turns away."""
    policy = SiteSettings.current().login_policy
    if admits(user, policy):
        return True
    log(LOGIN_REFUSED_BY_POLICY, user=str(user.pk), policy=policy)
    return False


def admits_session(user):
    """`admits_signing_in()` for a session's user, asked on every request. The cached settings may only
    let somebody in: a refusal is read again from the database, so lowering the ladder never waits on a
    stale cache, and raising it has already ended the sessions it excludes."""
    return admits(user, SiteSettings.cached().login_policy) or admits_signing_in(user)


def shut_out(policy):
    """Everybody `policy` no longer admits, as one query: each combination of flags the ladder refuses,
    asked of the ladder itself rather than restated here."""
    refused = Q(pk__in=[])
    for is_staff, is_superuser in product((False, True), repeat=2):
        if not SiteSettings.LoginPolicy.admits(policy, is_staff=is_staff, is_superuser=is_superuser):
            refused |= Q(is_staff=is_staff, is_superuser=is_superuser)
    return User.objects.filter(refused)


def sweep(policy):
    """Sign out everybody `policy` excludes, and nobody it still admits. Returns how many sessions
    ended, which is what an incident wants to know afterwards.

    Session keys come from allauth's rows: Django keeps a session's user inside its encoded data, so
    finding them there means decoding every session. The admin's own login writes no such row; the
    backends' check on every request ends those sessions instead.
    """
    tracked = UserSession.objects.filter(user__in=shut_out(policy))
    ended, _ = Session.objects.filter(
        session_key__in=tracked.values("session_key"), expire_date__gt=timezone.now()
    ).delete()
    # allauth lists a person's sessions from its own rows, which outlive the session they point at.
    tracked.delete()
    audit(LOGIN_POLICY_SWEPT, policy=policy, sessions=ended)
    return ended
