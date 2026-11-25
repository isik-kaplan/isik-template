from rest_framework.response import Response

from apps.common.api.reauthentication import ProvesWhoTheyAre
from apps.common.api.viewsets import BaseModelViewSet
from apps.users.api.permissions.is_staff import IsStaff
from apps.users.api.serializers.site_settings import SiteSettingsSerializer
from apps.users.models.site_settings import SiteSettings


# Routed by hand (users/api/urls.py): a router would add a list and a detail route for a row with no choice of id.
class SiteSettingsViewSet(ProvesWhoTheyAre, BaseModelViewSet):
    """The site-wide settings, one row, for staff."""

    model = SiteSettings
    endpoint = "site-settings"
    serializer_class = SiteSettingsSerializer
    permission_classes = [IsStaff]
    http_method_names = ["get", "patch", "head", "options"]
    reauthentication_acts = {"update_current": None}
    precondition_read_actions = ("current",)

    def get_object(self):
        """Made on first use, so there is always a version to read and to write against."""
        self.kwargs[self.lookup_url_kwarg or self.lookup_field] = SiteSettings.objects.get_or_create()[0].pk
        return super().get_object()

    def current(self, request):
        return Response(self.get_serializer(self.get_object()).data)

    def update_current(self, request):
        """Raising the ladder signs out everybody it no longer admits, straight away."""
        # Not partial, so the mail choice takes its default; no other field is required.
        serializer = self.get_serializer(self.get_object(), data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)
