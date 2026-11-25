from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission


class IsStaff(SignedInPermission):
    """Staff, and superusers whether or not they are also marked staff."""

    message = _("Only staff may do this.")

    def allows(self, user, request, view):
        return user.is_staff or user.is_superuser
