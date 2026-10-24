"""Who the login ladder admits, and signing out everybody it does not: existing sessions never sign in again."""

from itertools import product

from allauth.usersessions.models import UserSession
from django.contrib.sessions.models import Session
from django.db.models import Q
from django.utils import timezone

from apps.common.logging import LOGIN_POLICY_SWEPT, LOGIN_REFUSED_BY_POLICY, audit, log
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User


def admits(user, policy):
    return SiteSettings.LoginPolicy.admits(policy, is_staff=user.is_staff, is_superuser=user.is_superuser)


def admits_signing_in(user):
    """`admits()`, logging each refusal."""
    policy = SiteSettings.current().login_policy
    if admits(user, policy):
        return True
    log(LOGIN_REFUSED_BY_POLICY, user=str(user.pk), policy=policy)
    return False


def admits_session(user):
    """Asked on every request. The cache may only admit; a refusal is rechecked against the database."""
    return admits(user, SiteSettings.cached().login_policy) or admits_signing_in(user)


def shut_out(policy):
    """Everybody `policy` refuses, asking the ladder itself rather than restating it."""
    refused = Q(pk__in=[])
    for is_staff, is_superuser in product((False, True), repeat=2):
        if not SiteSettings.LoginPolicy.admits(policy, is_staff=is_staff, is_superuser=is_superuser):
            refused |= Q(is_staff=is_staff, is_superuser=is_superuser)
    return User.objects.filter(refused)


def sweep(policy):
    """Returns how many sessions ended. Keys come from allauth's rows, since Django's would need decoding;
    admin sessions have no such row and are ended by the backends' per-request check."""
    tracked = UserSession.objects.filter(user__in=shut_out(policy))
    ended, _ = Session.objects.filter(
        session_key__in=tracked.values("session_key"), expire_date__gt=timezone.now()
    ).delete()
    # allauth's rows outlive the session they point at.
    tracked.delete()
    audit(LOGIN_POLICY_SWEPT, policy=policy, sessions=ended)
    return ended
