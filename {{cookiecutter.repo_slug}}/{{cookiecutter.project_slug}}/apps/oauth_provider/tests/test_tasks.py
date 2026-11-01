"""Expired tokens are deleted on a schedule{% if cookiecutter.background_jobs == "celery-with-beat" %} (the beat){% else %} (uWSGI's cron){% endif %}, and only expired ones."""

from datetime import timedelta

import pytest
{%- if cookiecutter.background_jobs != "celery-with-beat" %}
from django.conf import settings
{%- endif %}
from django.core.management import call_command
from django.utils import timezone
from oauth2_provider.models import get_access_token_model

from apps.oauth_provider.tasks import clear_expired_tokens
{%- if cookiecutter.background_jobs == "celery-with-beat" %}

from {{ cookiecutter.project_slug }}.celery import app
{%- endif %}


AccessToken = get_access_token_model()


def _token(application, expires):
    return AccessToken.objects.create(
        user=application.user, application=application, token=f"t-{expires.timestamp()}", expires=expires
    )


@pytest.mark.django_db
def test_an_expired_token_goes_and_a_live_one_stays(application, logged):
    """Both halves: a cleanup that deleted everything would sign every client out at once."""
    dead = _token(application, timezone.now() - timedelta(days=1))
    alive = _token(application, timezone.now() + timedelta(days=1))

    clear_expired_tokens()

    assert set(AccessToken.objects.values_list("pk", flat=True)) == {alive.pk}
    assert not AccessToken.objects.filter(pk=dead.pk).exists()
    assert [line["event"] for line in logged] == ["oauth.expired_tokens_cleared"]


@pytest.mark.django_db
def test_the_command_runs_the_same_cleanup(application):
    dead = _token(application, timezone.now() - timedelta(days=1))

    call_command("clear_expired_tokens")

    assert not AccessToken.objects.filter(pk=dead.pk).exists()
{%- if cookiecutter.background_jobs == "celery-with-beat" %}


def test_the_beat_runs_it_daily():
    entry = app.conf.beat_schedule["clear-expired-tokens"]

    assert entry["task"] == clear_expired_tokens.name
    assert (entry["schedule"].hour, entry["schedule"].minute) == ({4}, {30})
{%- else %}


def test_the_cron_runs_it_daily():
    uwsgi = (settings.BASE_DIR / "uwsgi.ini").read_text()

    assert "cron2 = hour=4,minute=30,unique=1 python manage.py clear_expired_tokens" in uwsgi
{%- endif %}
