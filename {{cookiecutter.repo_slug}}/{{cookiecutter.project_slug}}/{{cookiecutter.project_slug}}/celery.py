import os

from celery import Celery
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
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
# Tells a trial that ended with no write that it ended.
merge_features_beat_schedule(app)
{%- endif %}
