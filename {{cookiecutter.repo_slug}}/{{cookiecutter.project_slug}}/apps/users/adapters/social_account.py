from allauth.account.adapter import get_adapter as get_account_adapter
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.providers.base.constants import AuthProcess
from django.conf import settings
from django.shortcuts import redirect
from isik.django.apps.common.db.orm import with_python_defaults

from apps.users.login_policy import admits_signing_in
from apps.users.reauthentication.proof import is_proving, proof_outcome_url, record_a_fresh_assertion, with_query


# Distinct from allauth's provider errors: no retry fixes this one.
LOGINS_CLOSED_ERROR = "logins_closed"


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """Social-signup policy."""

    def pre_social_login(self, request, sociallogin):
        super().pre_social_login(request, sociallogin)
        self.answer_a_proof_or_the_ladder(request, sociallogin)

    def answer_a_proof_or_the_ladder(self, request, sociallogin):
        # A reauthentication proof never logs in or connects anything; the flow ends here.
        if is_proving(sociallogin):
            proved = record_a_fresh_assertion(request, sociallogin)
            raise ImmediateHttpResponse(redirect(proof_outcome_url(sociallogin, proved)))
        # The social half of the login ladder. A connect comes from somebody already admitted.
        if sociallogin.state.get("process") == AuthProcess.CONNECT:
            return
        if not admits_signing_in(sociallogin.user):
            error_url = with_query(
                settings.HEADLESS_FRONTEND_URLS["socialaccount_login_error"], {"error": LOGINS_CLOSED_ERROR}
            )
            raise ImmediateHttpResponse(redirect(error_url))

    def populate_user(self, request, sociallogin, data):
        # The pending signup serializes this unsaved user into the session, which can't encode a db_default.
        return with_python_defaults(super().populate_user(request, sociallogin, data))

    def save_user(self, request, sociallogin, form=None):
        get_account_adapter().accept_terms(sociallogin.user)
        return super().save_user(request, sociallogin, form=form)
