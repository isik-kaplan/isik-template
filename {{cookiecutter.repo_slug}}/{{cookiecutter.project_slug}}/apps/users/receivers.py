"""Account events, written where allauth and Django announce them.

Signals rather than adapter overrides: every one of these is sent once per occurrence by whichever
flow caused it - the headless API, the admin's own login, a password reset link - so no flow added
later can forget to write its line.
"""

from allauth.account.signals import (
    email_changed,
    email_confirmed,
    password_changed,
    password_reset,
    password_set,
    user_signed_up,
)
from allauth.mfa.models import Authenticator
from allauth.mfa.signals import authenticator_added, authenticator_removed, authenticator_reset
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver

from apps.common.logging import (
    EMAIL_CHANGED,
    EMAIL_CONFIRMED,
    LOGIN_FAILED,
    LOGIN_SUCCEEDED,
    LOGOUT_SUCCEEDED,
    MFA_DISABLED,
    MFA_ENABLED,
    PASSKEY_ADDED,
    PASSKEY_REMOVED,
    PASSWORD_CHANGED,
    PASSWORD_RESET,
    RECOVERY_CODES_REGENERATED,
    SIGNUP_COMPLETED,
    audit,
    log,
)


@receiver(user_logged_in)
def logged_in(sender, user, **kwargs):
    log(LOGIN_SUCCEEDED, user=str(user.pk))


@receiver(user_login_failed)
def login_failed(sender, credentials, **kwargs):
    # `credentials` is deliberately unread: Django masks the password, not the identifier beside it.
    log(LOGIN_FAILED)


@receiver(user_logged_out)
def logged_out(sender, user, **kwargs):
    # None when the session had already expired - a logout of nobody is not worth a line.
    if user is not None:
        log(LOGOUT_SUCCEEDED, user=str(user.pk))


@receiver(user_signed_up)
def signed_up(sender, user, **kwargs):
    log(SIGNUP_COMPLETED, user=str(user.pk))


@receiver(email_confirmed)
def confirmed_email(sender, email_address, **kwargs):
    log(EMAIL_CONFIRMED, user=str(email_address.user_id))


@receiver(password_changed)
def changed_password(sender, user, **kwargs):
    audit(PASSWORD_CHANGED, user=str(user.pk), how="changed")


@receiver(password_set)
def set_password(sender, user, **kwargs):
    # An account that had none - a social signup - gaining one is a second way in, so the same event.
    audit(PASSWORD_CHANGED, user=str(user.pk), how="set")


@receiver(password_reset)
def reset_password(sender, user, **kwargs):
    audit(PASSWORD_RESET, user=str(user.pk))


@receiver(email_changed)
def changed_email(sender, user, **kwargs):
    audit(EMAIL_CHANGED, user=str(user.pk))


@receiver(authenticator_added)
def added_authenticator(sender, user, authenticator, **kwargs):
    # Recovery codes arrive with the first factor and are not a way in on their own, so no line.
    if authenticator.type == Authenticator.Type.TOTP:
        audit(MFA_ENABLED, user=str(user.pk), method=authenticator.type)
    elif authenticator.type == Authenticator.Type.WEBAUTHN:
        audit(PASSKEY_ADDED, user=str(user.pk))


@receiver(authenticator_removed)
def removed_authenticator(sender, user, authenticator, **kwargs):
    if authenticator.type == Authenticator.Type.TOTP:
        audit(MFA_DISABLED, user=str(user.pk), method=authenticator.type)
    elif authenticator.type == Authenticator.Type.WEBAUTHN:
        audit(PASSKEY_REMOVED, user=str(user.pk))


@receiver(authenticator_reset)
def reset_authenticator(sender, user, **kwargs):
    # Only recovery codes are ever reset: a fresh set replaces whatever was written down before.
    audit(RECOVERY_CODES_REGENERATED, user=str(user.pk))
