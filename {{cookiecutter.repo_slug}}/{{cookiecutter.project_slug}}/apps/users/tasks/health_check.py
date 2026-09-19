from celery import shared_task


@shared_task(name="ping")
def ping():
    """Proves the Celery pipeline works end to end - replace with real tasks."""
    return "pong"
