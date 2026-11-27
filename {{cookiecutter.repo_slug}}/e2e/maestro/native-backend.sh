#!/bin/bash
# The e2e backend without Docker, for the iOS flows: GitHub's Apple-silicon runners can't run containers.
# Serves the API on 127.0.0.1:80 (the caller points api. and auth.{{ cookiecutter.domain }} there in /etc/hosts),
# Mailpit on 8025 and the texts on 8026, with the e2e stack's settings. macOS with Homebrew and uv; sudo for port 80.
set -euo pipefail
cd "$(dirname "$0")/../.."
state="$PWD/e2e/maestro/.native"
mkdir -p "$state/sms"
[ -f .env ] || cp .env.example .env
value() { sed -n "s/^{{ cookiecutter.config_prefix }}__$1=//p" .env; }

brew install postgresql@18 mailpit
{%- if cookiecutter.cache == "redis" %} redis{% endif %}
{%- if cookiecutter.background_jobs != "inline" %} rabbitmq{% endif %}
{%- if cookiecutter.languages.split(',') | length > 1 %} gettext{% endif %}

pg="$(brew --prefix postgresql@18)/bin"
# TCP only: a socket under the checkout would pass the 103 characters macOS allows its path.
"$pg/initdb" -D "$state/pg" -U postgres --auth=trust >/dev/null
"$pg/pg_ctl" -D "$state/pg" -l "$state/postgres.log" -o "-h 127.0.0.1 -k ''" -w start
"$pg/psql" -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE \"$(value DB__USER)\" LOGIN SUPERUSER PASSWORD '$(value DB__PASSWORD)'" \
  -c "CREATE DATABASE \"$(value DB__NAME)\" OWNER \"$(value DB__USER)\""
{%- if cookiecutter.cache == "redis" %}

redis-server --bind 127.0.0.1 --requirepass "$(value CACHE__PASSWORD)" --daemonize yes --logfile "$state/redis.log"
{%- endif %}
{%- if cookiecutter.background_jobs != "inline" %}

# The stack's own broker settings, which RabbitMQ 4 needs for Celery.
# In the background and polled: await_startup gives up at once on a node that hasn't registered yet.
RABBITMQ_CONFIG_FILE="$PWD/broker/broker.conf" rabbitmq-server >"$state/rabbitmq.log" 2>&1 &
for _ in $(seq 60); do
  rabbitmq-diagnostics -q ping >/dev/null 2>&1 && break
  sleep 2
done
rabbitmq-diagnostics -q ping >/dev/null || { cat "$state/rabbitmq.log" >&2; exit 1; }
# The node answers ping before its app has booted, and add_user needs the app.
rabbitmqctl await_startup --timeout 120
rabbitmqctl add_user "$(value BROKER__USER)" "$(value BROKER__PASSWORD)"
rabbitmqctl set_permissions -p / "$(value BROKER__USER)" ".*" ".*" ".*"
{%- endif %}

mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 >"$state/mailpit.log" 2>&1 &
python3 -m http.server 8026 --bind 127.0.0.1 --directory "$state/sms" >"$state/sms.log" 2>&1 &

# Where the stack's containers find each of these, here on this machine; the rest is e2e/.env's.
export {{ cookiecutter.config_prefix }}__DB__HOST=127.0.0.1
{%- if cookiecutter.cache == "redis" %}
export {{ cookiecutter.config_prefix }}__CACHE__HOST=127.0.0.1
{%- endif %}
{%- if cookiecutter.background_jobs != "inline" %}
export {{ cookiecutter.config_prefix }}__BROKER__HOST=127.0.0.1
{%- endif %}
export {{ cookiecutter.config_prefix }}__EMAIL__BACKEND=smtp
export {{ cookiecutter.config_prefix }}__EMAIL__SMTP__HOST=127.0.0.1
export {{ cookiecutter.config_prefix }}__EMAIL__SMTP__PORT=1025
export {{ cookiecutter.config_prefix }}__EMAIL__SMTP__USE_TLS=false
{%- if cookiecutter.phone != "none" %}
export {{ cookiecutter.config_prefix }}__SMS__BACKEND=file
export {{ cookiecutter.config_prefix }}__SMS__FILE_PATH="$state/sms/messages.jsonl"
{%- endif %}
export {{ cookiecutter.config_prefix }}__RATE_LIMITS__ENABLED=false

cd {{ cookiecutter.project_slug }}
uv sync --frozen
{%- if cookiecutter.languages.split(',') | length > 1 %}
uv run python manage.py compilemessages -i .venv -i mutants
{%- endif %}
uv run python manage.py migrate
{%- if cookiecutter.cache == "database" %}
uv run python manage.py createcachetable
{%- endif %}
uv run python manage.py setup
{%- if cookiecutter.background_jobs != "inline" %}
uv run celery -A {{ cookiecutter.project_slug }} worker >"$state/worker.log" 2>&1 &
{%- endif %}
# Port 80 is root's; -E keeps the settings above.
sudo -E .venv/bin/python manage.py runserver 127.0.0.1:80 --noreload >"$state/backend.log" 2>&1 &
for _ in $(seq 60); do
  curl -sf -H "Host: localhost" http://127.0.0.1/health/ >/dev/null && exit 0
  sleep 2
done
cat "$state/backend.log" >&2
exit 1
