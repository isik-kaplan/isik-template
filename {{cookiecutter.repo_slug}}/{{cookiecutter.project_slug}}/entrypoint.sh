#!/bin/sh
set -e
{%- if cookiecutter.languages.split(',') | length > 1 %}
# Here, not in the image: the source is mounted over it. Workers wait for this service's health, so they read these.
python manage.py compilemessages -i .venv -i mutants
{%- endif %}
python manage.py migrate
# The cache's table is no model's, so no migration makes it. Nothing to make while the cache is Redis.
python manage.py createcachetable
python manage.py setup
python manage.py collectstatic --noinput
exec uwsgi --ini /{{ cookiecutter.project_slug }}/uwsgi.ini
