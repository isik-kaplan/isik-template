from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings

from apps.users.second_factor import keeps_a_second_factor


class MFAAdapter(DefaultMFAAdapter):
    """allauth derives the passkey RP ID from auth.<domain>, which doesn't cover the frontend's bare domain."""

    def get_public_key_credential_rp_entity(self):
        return {"id": settings.PARENT_HOST, "name": self.get_totp_issuer()}

    def can_delete_authenticator(self, authenticator):
        return keeps_a_second_factor(authenticator.user, [authenticator])
