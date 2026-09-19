import os

from celery import Celery


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{ cookiecutter.project_slug }}.settings")

app = Celery("{{ cookiecutter.project_slug }}")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.task_time_limit = 240
app.conf.task_soft_time_limit = 120
