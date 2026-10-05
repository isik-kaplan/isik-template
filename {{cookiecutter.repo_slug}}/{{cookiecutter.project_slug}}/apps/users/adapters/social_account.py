from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from allauth.socialaccount.providers.base.constants import AuthProcess
from django.conf import settings
from django.shortcuts import redirect
from django.utils import timezone

from apps.users.login_policy import admits_signing_in
from apps.users.reauthentication.proof import is_proving, proof_outcome_url, record_a_fresh_assertion, with_query


# Told apart from allauth's own provider-error codes so the page can say what actually happened: the
# door is shut to this person for now, which no retry fixes.
LOGINS_CLOSED_ERROR = "logins_closed"


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """Extension point for social-signup policy - e.g. restricting which providers can sign up
    new accounts vs. only connecting to an existing one."""

    def pre_social_login(self, request, sociallogin):
        super().pre_social_login(request, sociallogin)
        self.answer_a_proof_or_the_ladder(request, sociallogin)

    def answer_a_proof_or_the_ladder(self, request, sociallogin):
        # A proof we sent somebody to fetch never goes on to log anybody in, out or connect anything:
        # it is answered here and the flow ends, whatever it proved.
        if is_proving(sociallogin):
            proved = record_a_fresh_assertion(request, sociallogin)
            raise ImmediateHttpResponse(redirect(proof_outcome_url(sociallogin, proved)))
        # The social half of the login ladder; the password half is the authentication backends'. A
        # connect is made by somebody already signed in, whom the ladder has admitted already.
        if sociallogin.state.get("process") == AuthProcess.CONNECT:
            return
        if not admits_signing_in(sociallogin.user):
            error_url = with_query(
                settings.HEADLESS_FRONTEND_URLS["socialaccount_login_error"], {"error": LOGINS_CLOSED_ERROR}
            )
            raise ImmediateHttpResponse(redirect(error_url))

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
