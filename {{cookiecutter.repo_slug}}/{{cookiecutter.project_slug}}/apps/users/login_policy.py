"""Who the login ladder still admits, and signing out everybody it does not.

The sweep is what makes enforcing this at sign-in enough. An existing session never signs in again,
so without it the setting would be a lie for as long as the longest session lives - which during an
incident is the opposite of what it is for.
"""

from allauth.usersessions.models import UserSession
from django.contrib.sessions.models import Session
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


def shut_out(policy):
    """Everybody `policy` no longer admits."""
    return [user for user in User.objects.all() if not admits(user, policy)]


def _sessions_of(user_ids):
    """Live sessions belonging to any of these people. Django keeps the user inside the encoded
    session data rather than in a column, so this decodes rather than filters."""
    wanted = {str(pk) for pk in user_ids}
    for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if session.get_decoded().get("_auth_user_id") in wanted:
            yield session.session_key


def sweep(policy):
    """Sign out everybody `policy` excludes, and nobody it still admits. Returns how many sessions
    ended, which is what an incident wants to know afterwards."""
    excluded = [user.pk for user in shut_out(policy)]
    keys = list(_sessions_of(excluded))
    Session.objects.filter(session_key__in=keys).delete()
    # allauth lists a person's sessions from its own rows, which outlive the session they point at.
    UserSession.objects.filter(session_key__in=keys).delete()
    audit(LOGIN_POLICY_SWEPT, policy=policy, sessions=len(keys))
    return len(keys)
