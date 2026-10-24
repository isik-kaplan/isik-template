from importlib import import_module

from django.apps import AppConfig


class OAuthProviderConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.oauth_provider"

    def ready(self):
        # Registers the drf-spectacular extension, which nothing else imports.
        import_module("apps.oauth_provider.schema")
