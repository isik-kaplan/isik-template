# Otherwise @shared_task may bind to Celery's unconfigured default app.
from .celery import app as celery_app


# The one place the version is declared; pyproject.toml reads it from here.
__version__ = "0.1.0"

__all__ = ["celery_app", "__version__"]
