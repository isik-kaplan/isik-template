"""An approved scope must be dropped before the request it sat inside is narrowed, or the trigger
refuses the write."""

import pgtrigger
from django.db import transaction
from oauth2_provider.generators import generate_client_secret
from oauth2_provider.models import get_access_token_model, get_refresh_token_model

from apps.oauth_provider.models import Application
from apps.oauth_provider.registration import approved_on_registration


AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()

# Only the functions here open these, each for the one write it makes.
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
    """The secret is on `issued_secret`, readable only here: DOT hashes it on save."""
    secret = generate_client_secret()
    with deciding():
        application = Application.objects.create(
            **fields,
            user=user,
            authorization_grant_type=authorization_grant_type,
            client_secret=secret,
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
    """Narrowing takes effect at once; widening waits for a superuser, outside auto mode."""
    requested = set(requested_scopes)
    application.approved_scopes.set([scope for scope in application.approved_scopes.all() if scope in requested])
    application.requested_scopes.set(requested)
    if approved_on_registration() and application.approval in (
        Application.Approval.APPROVED,
        Application.Approval.DISABLED,
    ):
        with deciding():
            application.approved_scopes.set(requested)


@transaction.atomic
def approve_application(application, approved_scopes):
    with deciding():
        application.approved_scopes.set(approved_scopes)
        application.approval = Application.Approval.APPROVED
        application.save()
    return application


@transaction.atomic
def withdraw_application(application):
    with deciding():
        application.approval = Application.Approval.WITHDRAWN
        application.save()
    revoke_tokens(application)
    return application


@transaction.atomic
def disable_application(application):
    with deciding():
        application.approval = Application.Approval.DISABLED
        application.save()
    revoke_tokens(application)
    return application


def restore_application(application):
    with deciding():
        application.approval = Application.Approval.APPROVED
        application.save()
    return application


@transaction.atomic
def rotate_client_secret(application, *, revoke):
    """Tokens minted with the old secret keep working unless `revoke`: right for rotation, wrong for a leak."""
    secret = generate_client_secret()
    application.client_secret = secret
    application.save()
    if revoke:
        revoke_tokens(application)
    return secret


@transaction.atomic
def revoke_tokens(application, *, user=None):
    """Refresh tokens first and through `revoke()`: deleting an access token leaves its refresh token alive."""
    refresh_tokens = RefreshToken.objects.filter(application=application)
    access_tokens = AccessToken.objects.filter(application=application)
    if user is not None:
        refresh_tokens = refresh_tokens.filter(user=user)
        access_tokens = access_tokens.filter(user=user)
    for refresh_token in refresh_tokens:
        refresh_token.revoke()
    # Evaluated after the refresh tokens revoked theirs.
    for access_token in access_tokens:
        access_token.revoke()
