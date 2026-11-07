from datetime import timedelta

from allauth.account import app_settings
from allauth.account.models import EmailAddress
from celery import shared_task
from django.db.models import Exists, OuterRef
from django.utils.timezone import now

from apps.common.logging import UNVERIFIED_ACCOUNTS_REMOVED, audit
from apps.users.models.user import User

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


def unverified_accounts(at):
    """Signups that never proved their address within the time allauth's link worked for.

    Verification is mandatory, so none of them could ever sign in; what they do hold is the address, which a
    later genuine signup for the same mailbox would collide with. Staff and superusers are made rather than
    signed up, and an account that has signed in at all is somebody's, whatever its addresses say.
    """
    cutoff = at - timedelta(days=app_settings.EMAIL_CONFIRMATION_EXPIRE_DAYS)
    proven = EmailAddress.objects.filter(user=OuterRef("pk"), verified=True)
    return User.objects.filter(
        created_at__lt=cutoff, last_login__isnull=True, is_staff=False, is_superuser=False
    ).exclude(Exists(proven))


@shared_task(name="remove_unverified_accounts", base=OnCommitTask)
def remove_unverified_accounts():
    # Counted by model: the total delete() returns includes every row that cascaded with them.
    _, deleted = unverified_accounts(now()).delete()
    audit(UNVERIFIED_ACCOUNTS_REMOVED, removed=deleted.get(User._meta.label, 0))
