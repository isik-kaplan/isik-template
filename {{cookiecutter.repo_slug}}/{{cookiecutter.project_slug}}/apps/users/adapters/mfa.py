from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings


class MFAAdapter(DefaultMFAAdapter):
    """Passkeys are bound to a relying party ID that has to cover the page's own origin. allauth
    derives it from the request host, which here is auth.<domain> - not a suffix of the bare
    domain the frontend runs on, so the browser would refuse every ceremony."""

    def get_public_key_credential_rp_entity(self):
        return {"id": settings.PARENT_HOST, "name": self.get_totp_issuer()}
