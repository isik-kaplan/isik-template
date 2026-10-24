from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings


class MFAAdapter(DefaultMFAAdapter):
    """allauth derives the passkey RP ID from auth.<domain>, which doesn't cover the frontend's bare domain."""

    def get_public_key_credential_rp_entity(self):
        return {"id": settings.PARENT_HOST, "name": self.get_totp_issuer()}
