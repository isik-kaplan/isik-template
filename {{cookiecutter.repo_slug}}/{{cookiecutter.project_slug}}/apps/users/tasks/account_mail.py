from smtplib import SMTPException

from celery import shared_task
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from isik.django.apps.notifications.pipeline import record_email

from apps.common.logging import ACCOUNT_MAIL_UNRECORDED, log
from apps.notifications.kinds import RECORDED_MAIL

from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask


# OSError: a refused connection or EMAIL_TIMEOUT - an outage worth waiting out.
@shared_task(
    name="send_account_mail",
    base=OnCommitTask,
    bind=True,
    autoretry_for=(SMTPException, OSError),
    retry_backoff=True,
    max_retries=5,
)
def send_account_mail(self, subject, text, html, recipient, prefix=None, user_id=None):
    def send():
        send_mail(subject, text, None, [recipient], html_message=html)

    kind = RECORDED_MAIL.get(prefix)
    if kind is None:
        # A mail allauth added since this list was written: sent all the same, never held up by bookkeeping.
        log(ACCOUNT_MAIL_UNRECORDED, template=prefix)
        send()
        return
    user = get_user_model()._default_manager.filter(pk=user_id).first() if user_id else None
    # Its retries share the task's id, so they're attempts at one delivery rather than deliveries of their own.
    record_email(kind, address=recipient, send=send, user=user, key=self.request.id)
