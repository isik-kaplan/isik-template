# Ensures the Celery app is loaded whenever Django starts, so @shared_task always resolves against
# this project's configured app - without this, a call to some_task.delay() from Django code that
# never itself imported acme_widgets.celery would silently fall back to Celery's own unconfigured
# default app (broker_url amqp://guest@localhost//), not the one in celery.py.
from .celery import app as celery_app


__all__ = ["celery_app"]
