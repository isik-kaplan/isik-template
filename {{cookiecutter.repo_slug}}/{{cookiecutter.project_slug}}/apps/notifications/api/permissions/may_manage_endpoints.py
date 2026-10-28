from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission


class MayManageEndpoints(SignedInPermission):
    """Staff: an endpoint receives the whole deployment's notices."""

    message = _("Only staff manage webhook endpoints.")

    def allows(self, user, request, view):
        return user.is_staff
