from allauth.account.adapter import DefaultAccountAdapter
from allauth.core import context as allauth_context
from django.utils import translation

from apps.common.email import mjml_template, text_template
from apps.common.language import saved_language
from apps.users.login_policy import admits
from apps.users.models.site_settings import SiteSettings
from apps.users.tasks.account_mail import send_account_mail


class AccountAdapter(DefaultAccountAdapter):
    """Extension point for signup policy - e.g. invite-only signup - plus MJML-rendered account
    emails in place of allauth's own plain-Django-template default."""

    # Every call site (send_confirmation_mail, send_notification_mail, password_reset_by_code,
    # ...) already passes the full "account/email/<flow>" prefix - "" is not a no-op left in by
    # mistake, it's what keeps this adapter from doubling that prefix onto itself. A plain string,
    # not a pathlib.Path: Django's template loader does its own string-keyed cache lookup and
    # silently misses (TemplateDoesNotExist) on an equivalent Path, even though str(path) matches.
    email_folder = ""

    def authenticate(self, request, **credentials):
        # allauth hands back a user its backend refused, so it can explain an inactive account - which
        # would wave somebody the login policy shuts out straight through. The backend logged it.
        user = super().authenticate(request, **credentials)
        return user if user is None or admits(user, SiteSettings.current().login_policy) else None

    # allauth_context.request, not a `request` param - send_mail() isn't given one; the
    # request-scoped ContextVar allauth's own view layer sets is the only way to reach it here,
    # and every email template needs it for site_url and any context processors it depends on.
    def send_mail(self, template_prefix, email, context):
        request = allauth_context.request
        context = {**context, "email": email}
        prefix = f"{self.email_folder}{template_prefix}"
        # The recipient's own choice first - the active language is whoever triggered the send,
        # which is only the recipient when they did it themselves.
        with translation.override(saved_language(context.get("user")) or translation.get_language()):
            html_content = mjml_template(f"{prefix}/message.html", context, request)
            text_content = text_template(f"{prefix}/message.txt", context, request)
            subject = text_template(f"{prefix}/subject.txt", context, request).strip()
        # Rendered here, where the request is, and sent by the worker: an SMTP host that hangs or refuses
        # holds up a task rather than this request. The task waits for the transaction that asked for it.
        send_account_mail.delay(subject, text_content, html_content, email)
