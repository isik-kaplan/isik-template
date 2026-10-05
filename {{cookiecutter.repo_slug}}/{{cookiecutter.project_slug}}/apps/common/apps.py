from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
    # isik's own `common` app already claims that label. Free to differ because this app owns no tables.
    label = "{{ cookiecutter.project_slug }}_common"

    def ready(self):
        # Imported for their @register side effect - a check has to be reachable by autodiscovery.
        from .checks import atomicity, schema_docs  # noqa: F401
