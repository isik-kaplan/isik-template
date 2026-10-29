import posixpath

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core import context as allauth_context
from django.core.exceptions import PermissionDenied
from django.utils import timezone, translation
from isik.django.apps.notifications.kinds import raise_notice

from apps.common.client_ip import client_ip
from apps.common.email import mjml_template, text_template
from apps.common.language import saved_language
from apps.notifications.kinds import ACCOUNT_CHANGED
from apps.users.login_policy import admits
from apps.users.models.site_settings import SiteSettings
from apps.users.tasks.account_mail import send_account_mail
from apps.users.terms import TERMS_VERSION


class AccountAdapter(DefaultAccountAdapter):
    """Signup policy plus MJML-rendered account emails."""

    # Callers already pass the full "account/email/<flow>" prefix. A str, not a Path: the template
    # loader's cache misses on a Path.
    email_folder = ""

    def get_client_ip(self, request):
        """nginx's answer, not allauth's X-Forwarded-For reading, which would see the frontend's address."""
        ip = client_ip(request)
        if not ip:
            raise PermissionDenied("Unable to determine client IP address")
        return ip

    def authenticate(self, request, **credentials):
        # allauth returns a user its backend refused (to explain inactivity), which would bypass the policy.
        user = super().authenticate(request, **credentials)
        return user if user is None or admits(user, SiteSettings.current().login_policy) else None

    def save_user(self, request, user, form, commit=True):
        self.accept_terms(user)
        return super().save_user(request, user, form, commit=commit)

    def accept_terms(self, user):
        """Shared with the social adapter so every signup records the same terms."""
        if TERMS_VERSION:
            user.terms_version = TERMS_VERSION
            user.terms_accepted_at = timezone.now()

    # send_mail() gets no request; allauth's request ContextVar is the only way to reach it.
    def send_mail(self, template_prefix, email, context):
        request = allauth_context.request
        context = {**context, "email": email}
        prefix = f"{self.email_folder}{template_prefix}"
        # The active language is whoever triggered the send, not necessarily the recipient.
        with translation.override(saved_language(context.get("user")) or translation.get_language()):
            html_content = mjml_template(f"{prefix}/message.html", context, request)
            text_content = text_template(f"{prefix}/message.txt", context, request)
            subject = text_template(f"{prefix}/subject.txt", context, request).strip()
        user = context.get("user")
        # Rendered here, where the request is; sent by the worker so a hung SMTP host can't block the request.
        send_account_mail.delay(
            subject, text_content, html_content, email, prefix, str(user.pk) if user and user.pk else None
        )
        variant = posixpath.basename(prefix)
        if user is not None and user.pk and variant in ACCOUNT_CHANGED.variants:
            raise_notice(ACCOUNT_CHANGED, variant=variant, snapshot={"user": str(user.pk)})
