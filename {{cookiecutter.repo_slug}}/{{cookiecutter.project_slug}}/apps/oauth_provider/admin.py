"""DOT's application admin, kept for looking applications up and deleting one, and nothing else.

Its form offers every column DOT has - the approval, whether anybody is asked, which grant it uses - and
those changes belong to the pages built for them: /applications for an owner, /staff/applications for a
superuser. The database refuses an approval from anywhere else, so this form would only offer what the
save then refuses.
"""

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
