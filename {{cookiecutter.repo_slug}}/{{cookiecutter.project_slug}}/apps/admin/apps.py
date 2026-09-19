from django.apps import AppConfig


class AdminConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.admin"
    # "admin" collides with django.contrib.admin's own default label - every ModelAdmin
    # registration in this app still lives under apps/admin/admin/ (autodiscovery needs that exact
    # module name), only the app's Django-facing label changes.
    label = "administration"
