"""What runs the boundary sweep{% if cookiecutter.background_jobs == "celery-with-beat" %}: one run at the next boundary, with the beat hourly behind it{% else %}: uWSGI's minute cron{% endif %}."""

{% if cookiecutter.background_jobs == "celery-with-beat" -%}
from datetime import timedelta

from django.conf import settings

from {{ cookiecutter.project_slug }}.celery import app


def test_a_run_is_scheduled_at_the_next_boundary():
    assert settings.ISIK_FEATURES["SWEEP"] == "next_boundary"


def test_the_beat_is_an_hourly_backstop_for_a_run_the_broker_lost():
    assert app.conf.beat_schedule["isik.features.sweep"]["schedule"] == timedelta(hours=1)
{%- else -%}
from django.conf import settings


def test_without_a_beat_the_sweep_runs_on_an_interval():
    uwsgi = (settings.BASE_DIR / "uwsgi.ini").read_text()

    assert "SWEEP" not in settings.ISIK_FEATURES
    assert "cron2 = minute=-1,unique=1 python manage.py features --sweep" in uwsgi
{%- endif %}
