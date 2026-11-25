from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission
from rest_framework.permissions import SAFE_METHODS

from apps.users.granting import may_grant


class MayManageGroups(SignedInPermission):
    """Whoever reads every account reads the groups; changing one changes what its members may, so it is a grant."""

    message = _("You cannot change groups.")

    def allows(self, user, request, view):
        if request.method in SAFE_METHODS:
            return user.may_see_every_account
        return may_grant(user)
