"""For looking applications up and deleting one only: the database refuses the approval changes its
form would offer."""

from django.contrib import admin
from oauth2_provider import admin as dot_admin
from oauth2_provider.models import get_application_model


Application = get_application_model()


class ApplicationAdmin(dot_admin.ApplicationAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


admin.site.unregister(Application)
admin.site.register(Application, ApplicationAdmin)
