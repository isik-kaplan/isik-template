"""What happens to an application across its life, and to the tokens it holds.

Functions rather than serializer bodies, because the order matters: an approved scope must be dropped before
the request it sat inside is narrowed, or the trigger keeping one inside the other refuses the write.
"""

import pgtrigger
from django.db import transaction
from oauth2_provider.generators import generate_client_secret
from oauth2_provider.models import get_access_token_model, get_refresh_token_model

from apps.oauth_provider.models import Application
from apps.oauth_provider.registration import approved_on_registration


AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()

# The triggers keeping an application's approval out of everybody else's hands - DOT's admin, a shell, a
# stray update(). Only the functions here open them, each for the one write it makes.
APPROVAL_GUARDS = (
    "oauth_provider.Application:approval_moves_only_through_its_services",
    "oauth_provider.Application:born_pending",
    "oauth_provider.ApprovedScope:approved_only_through_its_services",
)


def deciding():
    return pgtrigger.ignore(*APPROVAL_GUARDS)


@transaction.atomic
def register_application(
    *, user, requested_scopes, authorization_grant_type=Application.GRANT_AUTHORIZATION_CODE, **fields
):
    """Returns the application, with the secret it was issued as `issued_secret` - readable here and
    nowhere else, since DOT hashes it on save."""
    secret = generate_client_secret()
    with deciding():
        application = Application.objects.create(
            **fields,
            user=user,
            authorization_grant_type=authorization_grant_type,
            client_secret=secret,
            # Every person is asked - skip_authorization stays False, which the always_asks constraint holds
            # it to. An application nobody is asked about is one acting on its own.
            algorithm=Application.RS256_ALGORITHM,
            approval=Application.Approval.APPROVED if approved_on_registration() else Application.Approval.PENDING,
        )
        application.requested_scopes.set(requested_scopes)
        if approved_on_registration():
            application.approved_scopes.set(requested_scopes)
    application.issued_secret = secret
    return application


@transaction.atomic
def change_requested_scopes(application, requested_scopes):
    """Narrowing takes effect at once, for the approval too. Widening waits for a superuser unless nothing
    here waits for one - an approval only ever covers what a superuser saw."""
    requested = set(requested_scopes)
    application.approved_scopes.set([scope for scope in application.approved_scopes.all() if scope in requested])
    application.requested_scopes.set(requested)
    # Not for a withdrawn one, whose approval a superuser took back, nor one still waiting for them.
    if approved_on_registration() and application.approval in (
        Application.Approval.APPROVED,
        Application.Approval.DISABLED,
    ):
        with deciding():
            application.approved_scopes.set(requested)


@transaction.atomic
def approve_application(application, approved_scopes):
    """A superuser's answer: approved, for these of what it asked for."""
    with deciding():
        application.approved_scopes.set(approved_scopes)
        application.approval = Application.Approval.APPROVED
        application.save()
    return application


@transaction.atomic
def withdraw_application(application):
    """A superuser taking it down, everywhere, now."""
    with deciding():
        application.approval = Application.Approval.WITHDRAWN
        application.save()
    revoke_tokens(application)
    return application


@transaction.atomic
def disable_application(application):
    """Its owner's own off switch, and the only state it may be deleted from."""
    with deciding():
        application.approval = Application.Approval.DISABLED
        application.save()
    revoke_tokens(application)
    return application


def restore_application(application):
    """Putting back what disabling took down, within the approval it already had."""
    with deciding():
        application.approval = Application.Approval.APPROVED
        application.save()
    return application


@transaction.atomic
def rotate_client_secret(application, *, revoke):
    """A new secret for the same client id, returned once.

    The old one stops working; tokens minted with it do not, since they do not carry it. That is right for
    routine rotation and wrong for a leak - whoever had the secret has tokens too - so taking those down
    is asked for, not assumed.
    """
    secret = generate_client_secret()
    application.client_secret = secret
    application.save()
    if revoke:
        revoke_tokens(application)
    return secret


@transaction.atomic
def revoke_tokens(application, *, user=None):
    """Every token the application holds - for one person, when named. Refresh tokens first and through
    `revoke()`: deleting an access token leaves its refresh token alive, and that mints a new one."""
    # Revoked ones too: revoking one twice does nothing.
    refresh_tokens = RefreshToken.objects.filter(application=application)
    access_tokens = AccessToken.objects.filter(application=application)
    if user is not None:
        refresh_tokens = refresh_tokens.filter(user=user)
        access_tokens = access_tokens.filter(user=user)
    for refresh_token in refresh_tokens:
        refresh_token.revoke()
    # Read again here, after the refresh tokens took theirs: what is left had none.
    for access_token in access_tokens:
        access_token.revoke()
