from django.apps import AppConfig
from django.conf import settings


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        from apps.common.enum_names import enum_name_overrides

        # Not in settings, which is imported before the app registry exists. Any later than this and
        # drf-spectacular has already cached the overrides it loaded.
        settings.SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"] = enum_name_overrides()
