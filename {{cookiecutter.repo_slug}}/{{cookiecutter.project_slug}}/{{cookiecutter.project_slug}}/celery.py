import os

from celery import Celery


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "{{ cookiecutter.project_slug }}.settings")

# Every task defers its dispatch until the transaction that asked for it commits - see celery_task.py.
app = Celery(
    "{{ cookiecutter.project_slug }}",
    task_cls="{{ cookiecutter.project_slug }}.celery_task:OnCommitTask",
)
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.task_time_limit = 240
app.conf.task_soft_time_limit = 120
