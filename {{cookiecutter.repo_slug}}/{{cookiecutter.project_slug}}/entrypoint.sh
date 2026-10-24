#!/bin/sh
set -e
python manage.py migrate
{%- if cookiecutter.cache == "database" %}
# The cache's table is no model's, so no migration makes it.
python manage.py createcachetable
{%- endif %}
python manage.py setup
python manage.py collectstatic --noinput
exec uwsgi --ini /{{ cookiecutter.project_slug }}/uwsgi.ini
