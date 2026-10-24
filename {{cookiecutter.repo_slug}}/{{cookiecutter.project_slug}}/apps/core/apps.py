from django.apps import AppConfig
from django.conf import settings


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        from isik.django.drf.spectacular import enum_name_overrides as with_generated_models

        from apps.common.enum_names import enum_name_overrides

        # Settings import before the app registry; any later, drf-spectacular has cached them.
        settings.SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"] = with_generated_models(enum_name_overrides())
