import os
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
from datetime import timedelta
{%- endif %}

from celery import Celery
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
from celery.schedules import crontab
from isik.django.apps.features.schedule import merge_beat_schedule as merge_features_beat_schedule
from isik.django.apps.notifications.schedule import merge_beat_schedule
{%- endif %}


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{ cookiecutter.project_slug }}.settings")

app = Celery(
    "{{ cookiecutter.project_slug }}",
    task_cls="{{ cookiecutter.project_slug }}.celery_task:OnCommitTask",
)
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.task_time_limit = 240
app.conf.task_soft_time_limit = 120
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
# django-celery-beat copies the schedule into its table when beat starts.
merge_beat_schedule(app)
# Tells a trial that ended with no write that it ended. Hourly: SWEEP next_boundary runs it at the boundary, and
# this backstop catches a run the broker lost.
merge_features_beat_schedule(app, sweep_every=timedelta(hours=1))


@app.on_after_configure.connect
def schedule_housekeeping(sender, **kwargs):
    """Merged like isik's entries: a CELERY_BEAT_SCHEDULE setting would shadow theirs."""
    # Daily: the token tables stay correct however large they grow.
    tokens = {"task": "clear_expired_tokens", "schedule": crontab(hour=4, minute=30)}
    sender.conf.beat_schedule = {**(sender.conf.beat_schedule or {}), "clear-expired-tokens": tokens}
{%- endif %}
