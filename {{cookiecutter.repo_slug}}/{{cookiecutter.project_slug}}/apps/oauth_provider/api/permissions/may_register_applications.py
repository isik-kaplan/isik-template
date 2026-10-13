from django.utils.translation import gettext_lazy as _
from rest_framework.permissions import BasePermission

from apps.oauth_provider.registration import may_register_applications


class MayRegisterApplications(BasePermission):
    message = _("You cannot register applications here.")

    def has_permission(self, request, view):
        return may_register_applications(request.user)
