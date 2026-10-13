from importlib import import_module

from django.apps import AppConfig


class OAuthProviderConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.oauth_provider"

    def ready(self):
        # drf-spectacular finds an extension by its class having been defined, and nothing else imports it.
        import_module("apps.oauth_provider.schema")
