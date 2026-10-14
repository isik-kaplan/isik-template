from django.conf import settings
from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission


class MayAnswerDevices(SignedInPermission):
    """Anybody signed in, while the provider is on: the code says which device, and the person entering it
    decides for their own account only."""

    message = _("No device signs anybody in here.")

    def allows(self, user, request, view):
        return settings.OAUTH_PROVIDER_MODE != "off"
