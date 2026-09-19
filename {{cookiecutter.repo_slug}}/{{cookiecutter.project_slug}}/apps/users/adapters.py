from allauth.account.adapter import DefaultAccountAdapter
from allauth.core import context as allauth_context
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.common.email import mjml_template, text_template


class AccountAdapter(DefaultAccountAdapter):
    """Extension point for signup policy - e.g. invite-only signup - plus MJML-rendered account
    emails in place of allauth's own plain-Django-template default."""

    # Every call site (send_confirmation_mail, send_notification_mail, password_reset_by_code,
    # ...) already passes the full "account/email/<flow>" prefix - "" is not a no-op left in by
    # mistake, it's what keeps this adapter from doubling that prefix onto itself. A plain string,
    # not a pathlib.Path: Django's template loader does its own string-keyed cache lookup and
    # silently misses (TemplateDoesNotExist) on an equivalent Path, even though str(path) matches.
    email_folder = ""

    # allauth_context.request, not a `request` param - send_mail() isn't given one; the
    # request-scoped ContextVar allauth's own view layer sets is the only way to reach it here,
    # and every email template needs it for site_url and any context processors it depends on.
    def send_mail(self, template_prefix, email, context):
        request = allauth_context.request
        context = {**context, "email": email}
        prefix = f"{self.email_folder}{template_prefix}"
        html_content = mjml_template(f"{prefix}/message.html", context, request)
        text_content = text_template(f"{prefix}/message.txt", context, request)
        subject = text_template(f"{prefix}/subject.txt", context, request).strip()
        send_mail(
            subject,
            text_content,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
            html_message=html_content,
        )


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """Extension point for social-signup policy - e.g. restricting which providers can sign up
    new accounts vs. only connecting to an existing one."""

    def populate_user(self, request, sociallogin, data):
        # BaseModel's created_at/updated_at are db_default only (isik's own design - see
        # apps/common/models/base.py), so an unsaved instance carries the raw Now() expression
        # rather than a real datetime. The pending-signup path stashes exactly this suggested,
        # not-yet-saved user in the session (redirect_to_signup -> sociallogin.serialize()), which
        # walks every field through get_prep_value() - Now() isn't a string, so parse_datetime()
        # crashes with a 500 before the signup form ever renders. Never hit on a normal save():
        # the database supplies the real value at INSERT and this attribute is never read first.
        user = super().populate_user(request, sociallogin, data)
        now = timezone.now()
        user.created_at = now
        user.updated_at = now
        return user
