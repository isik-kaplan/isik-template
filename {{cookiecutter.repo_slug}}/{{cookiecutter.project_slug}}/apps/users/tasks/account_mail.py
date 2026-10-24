from smtplib import SMTPException

from celery import shared_task
from django.core.mail import send_mail

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


# OSError: a refused connection or EMAIL_TIMEOUT - an outage worth waiting out.
@shared_task(
    name="send_account_mail",
    base=OnCommitTask,
    autoretry_for=(SMTPException, OSError),
    retry_backoff=True,
    max_retries=5,
)
def send_account_mail(subject, text, html, recipient):
    send_mail(subject, text, None, [recipient], html_message=html)
