from smtplib import SMTPException

from celery import shared_task
from django.core.mail import send_mail

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


# OSError covers a refused connection and EMAIL_TIMEOUT's socket timeout alike: both are the mail
# host's outage, which is worth waiting out, rather than anything wrong with the message.
@shared_task(
    name="send_account_mail",
    base=OnCommitTask,
    autoretry_for=(SMTPException, OSError),
    retry_backoff=True,
    max_retries=5,
)
def send_account_mail(subject, text, html, recipient):
    """Sends one account mail rendered by `AccountAdapter.send_mail`, off the request that asked."""
    # No sender is DEFAULT_FROM_EMAIL, and not failing silently is the default: a raise is what retries.
    send_mail(subject, text, None, [recipient], html_message=html)
