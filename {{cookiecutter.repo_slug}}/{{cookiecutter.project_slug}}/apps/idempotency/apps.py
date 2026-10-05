from django.apps import AppConfig


class IdempotencyConfig(AppConfig):
    """Owns no tables - isik's `by_reference` app holds the claim - and exists for the check that says
    which handlers are covered, which isik leaves to the project."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.idempotency"

    def ready(self):
        from . import checks  # noqa: F401
