from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission

from apps.users.permissions import Permission


class MayManageUsers(SignedInPermission):
    """A permission rather than a rank, so it can go to non-staff; widening access is checked separately."""

    message = _("You cannot manage other people's accounts.")

    def allows(self, user, request, view):
        return user.has_perm(Permission.USERS_MANAGE_USER)
