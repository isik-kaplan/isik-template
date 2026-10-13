from django.utils.translation import gettext_lazy as _
from isik.django.drf.permissions import SignedInPermission

from apps.users.permissions import Permission


class MayManageUsers(SignedInPermission):
    """Who changes somebody else's account, as a permission rather than a rank: `users:manage:user` can be
    given to somebody who is not staff, while widening what people may do stays its own right, checked
    where the write happens - see apps/users/granting.py."""

    message = _("You cannot manage other people's accounts.")

    def allows(self, user, request, view):
        return user.has_perm(Permission.USERS_MANAGE_USER)
