#!/bin/sh
set -e
{%- if cookiecutter.languages.split(',') | length > 1 %}
# Here, not in the image: the source is mounted over it. Workers wait for this service's health, so they read these.
python manage.py compilemessages -i .venv -i mutants
{%- endif %}
python manage.py migrate
{%- if cookiecutter.cache == "database" %}
# The cache's table is no model's, so no migration makes it.
python manage.py createcachetable
{%- endif %}
python manage.py setup
python manage.py collectstatic --noinput
exec uwsgi --ini /{{ cookiecutter.project_slug }}/uwsgi.ini
