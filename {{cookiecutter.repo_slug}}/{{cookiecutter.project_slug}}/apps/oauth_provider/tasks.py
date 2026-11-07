from celery import shared_task
from django.utils import timezone
from oauth2_provider.models import (
    clear_expired,
    get_access_token_model,
    get_grant_model,
    get_id_token_model,
    get_refresh_token_model,
)

from apps.common.logging import EXPIRED_TOKENS_CLEARED, log

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


# The four tables clear_expired() deletes from.
TABLES = (get_refresh_token_model, get_access_token_model, get_id_token_model, get_grant_model)


def _held(since):
    """Rows that already existed at `since`: a sign-in during the run inserts one, which a plain total would
    subtract from the deletions. clear_expired() itself returns nothing to count."""
    return sum(model().objects.filter(created__lt=since).count() for model in TABLES)


@shared_task(name="clear_expired_tokens", base=OnCommitTask)
def clear_expired_tokens():
    """Expired access tokens, their refresh tokens and spent grants: nothing else deletes them, so the tables
    grow with every sign-in. An expired token is already refused by its own `expires`; this is about size."""
    started = timezone.now()
    before = _held(started)
    clear_expired()
    log(EXPIRED_TOKENS_CLEARED, deleted=before - _held(started))
