from celery import shared_task
from oauth2_provider.models import clear_expired

from apps.common.logging import EXPIRED_TOKENS_CLEARED, log

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


@shared_task(name="clear_expired_tokens", base=OnCommitTask)
def clear_expired_tokens():
    """Expired access tokens, their refresh tokens and spent grants: nothing else deletes them, so the tables
    grow with every sign-in. An expired token is already refused by its own `expires`; this is about size."""
    clear_expired()
    log(EXPIRED_TOKENS_CLEARED)
