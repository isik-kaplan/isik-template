"""What this project adds to isik's account deletion: tokens revoked on asking, a cancel on signing in, the
notices, and the audit trail. Signals, so every way of signing in cancels a deletion."""

from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver
from isik.django.apps.accounts.deletion import cancel_pending_deletion
from isik.django.apps.accounts.signals import account_deleted, account_deletion_cancelled, account_deletion_requested
from isik.django.apps.notifications.kinds import raise_notice

from apps.common.logging import ACCOUNT_DELETED, ACCOUNT_DELETION_CANCELLED, ACCOUNT_DELETION_REQUESTED, audit
from apps.notifications.kinds import DELETION_CANCELLED, DELETION_SCHEDULED
from apps.oauth_provider.services import revoke_every_token_of
from apps.users.models.personal_access_token import PersonalAccessToken


def revoke_every_token(user):
    """Ending the sessions leaves a token working, and a token can't sign in to cancel: each goes for good."""
    PersonalAccessToken.objects.filter(user=user).delete()
    revoke_every_token_of(user)


@receiver(account_deletion_requested)
def deletion_requested(sender, user, deletes_at, **kwargs):
    revoke_every_token(user)
    audit(ACCOUNT_DELETION_REQUESTED, user=str(user.pk), deletes_at=deletes_at.isoformat())
    raise_notice(DELETION_SCHEDULED, snapshot={"user": str(user.pk), "date": deletes_at.date().isoformat()})


@receiver(user_logged_in)
def cancel_on_sign_in(sender, user, **kwargs):
    cancel_pending_deletion(user)


@receiver(account_deletion_cancelled)
def deletion_cancelled(sender, user, **kwargs):
    audit(ACCOUNT_DELETION_CANCELLED, user=str(user.pk))
    raise_notice(DELETION_CANCELLED, snapshot={"user": str(user.pk)})


@receiver(account_deleted)
def deleted(sender, user_id, **kwargs):
    audit(ACCOUNT_DELETED, user=str(user_id))
