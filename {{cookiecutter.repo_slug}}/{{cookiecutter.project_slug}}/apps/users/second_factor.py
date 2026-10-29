"""While somebody's `two_factor_required` is on, their last second factor stays: allauth asks the MFA adapter
before turning TOTP off, but deletes passkeys without asking, so their input asks here too."""

from allauth.headless.mfa.inputs import DeleteWebAuthnInput
from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from isik.django.apps.features.resolution import effective


FACTORS = (Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN)


def keeps_a_second_factor(user, removing):
    """Whether removing `removing` leaves the second factor `two_factor_required` asks for, if it asks."""
    if not effective(user, "two_factor_required").value:
        return True
    left = Authenticator.objects.filter(user=user, type__in=FACTORS).exclude(pk__in=[each.pk for each in removing])
    return left.exists()


class KeepingDeleteWebAuthnInput(DeleteWebAuthnInput):
    def clean(self):
        cleaned_data = super().clean()
        if not keeps_a_second_factor(self.user, cleaned_data.get("authenticators", [])):
            raise get_adapter().validation_error("cannot_delete_authenticator")
        return cleaned_data
