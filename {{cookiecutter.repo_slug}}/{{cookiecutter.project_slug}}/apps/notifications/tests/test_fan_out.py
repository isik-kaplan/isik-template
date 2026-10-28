"""Something always starts the fan-out{% if cookiecutter.background_jobs == "celery-with-beat" %}: the beat{% else %}: every write, every task, and a minute's cron for the rest{% endif %}."""

{% if cookiecutter.background_jobs == "celery-with-beat" -%}
from isik.django.apps.notifications.schedule import beat_schedule

from {{ cookiecutter.project_slug }}.celery import app


def test_the_beat_runs_every_notifications_task():
    """isik.W006 catches a schedule never merged; this catches one merged and later lost."""
    assert beat_schedule().items() <= app.conf.beat_schedule.items()
{%- else -%}
from django.conf import settings
from isik.django.apps.notifications.hooks import MIDDLEWARE


def test_a_write_or_a_task_that_left_a_notice_waiting_starts_its_fan_out():
    assert MIDDLEWARE in settings.MIDDLEWARE
    assert settings.ISIK_NOTIFICATIONS["FAN_OUT_AFTER_TASKS"] is True


def test_a_cron_runs_what_a_beat_would_for_writes_nobody_watched_and_retries_that_fell_due():
    uwsgi = (settings.BASE_DIR / "uwsgi.ini").read_text()

    assert "cron2 = minute=-1,unique=1 python manage.py notices --work" in uwsgi
{%- endif %}
