from django.conf import settings
from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission


class MayReviewApplications(SignedInPermission):
    """Superusers, while the provider is on. Only them for now: approving widens what an application may
    ask everybody for, and nothing yet says who else should be trusted with that."""

    message = _("Only a superuser reviews applications.")

    def allows(self, user, request, view):
        return settings.OAUTH_PROVIDER_MODE != "off" and user.is_superuser
