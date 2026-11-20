import os
import subprocess
import sys


def test_every_task_beat_sends_is_one_a_fresh_worker_knows():
    """In an interpreter of its own: here the tests have imported every task module already, registering them."""
    script = (
        "import django; django.setup(); "
        "from {{ cookiecutter.project_slug }}.celery import app; app.loader.import_default_modules(); "
        "sent = {entry['task'] for entry in (app.conf.beat_schedule or {}).values()}; "
        "print(len(sent), sorted(sent - set(app.tasks)))"
    )

    result = subprocess.run([sys.executable, "-c", script], env=os.environ, capture_output=True, text=True, check=True)

    scheduled, unknown = result.stdout.splitlines()[-1].split(" ", 1)
    assert unknown == "[]"
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
    assert int(scheduled) > 0
{%- else %}
    # Nothing runs on a schedule without beat.
    assert int(scheduled) == 0
{%- endif %}
