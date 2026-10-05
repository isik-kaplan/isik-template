#!/usr/bin/env bash
# Writes .env, for either local development or a real deployment. Run automatically as
# cookiecutter's own last generation step (see hooks/post_gen_project.py) - a plain
# `cookiecutter gh:isik-kaplan/isik-template` leaves you with a working .env already, no second
# command needed. Rerun it by hand later (`bash scripts/setup.sh`) to redo that choice, e.g. to
# move the same checkout from dev to a real deployment.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"
PREFIX="{{ cookiecutter.config_prefix }}"

if [ -f "$ENV_FILE" ]; then
  if [ -t 0 ]; then
    read -r -p "$ENV_FILE already exists - overwrite it? [y/N] " overwrite
    case "$overwrite" in
      y|Y) ;;
      *) echo "Leaving $ENV_FILE as-is."; exit 0 ;;
    esac
  else
    # Non-interactive and already has an .env (e.g. a second cookiecutter post-gen pass) - never
    # clobber silently.
    exit 0
  fi
fi

cp "$EXAMPLE_FILE" "$ENV_FILE"

if [ ! -t 0 ]; then
  # No real terminal attached - a CI bake (tests/, bake-real-ci) or this script fed from a pipe.
  # .env.example's own values already work for local development out of the box (see its own
  # header comment), so there is nothing to prompt for.
  exit 0
fi

echo
echo "Set up {{ cookiecutter.project_name }} for:"
echo "  1) local development - .env.example's values already work, nothing else to decide"
echo "  2) a real deployment - generates strong secrets and asks for real configuration"
read -r -p "Choice [1]: " mode
mode="${mode:-1}"

if [ "$mode" != "2" ]; then
  echo "Wrote $ENV_FILE for local development."
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found - can't generate strong secrets. Install it and rerun this script." >&2
  exit 1
fi

# Replaces KEY=... (commented or not) in .env, appending it if the key isn't there at all. Python,
# not sed - a generated secret or a typed-in value can contain characters sed would treat as
# pattern/replacement syntax (&, /, newlines from a pasted multi-line value never happen here, but
# the others do).
set_var() {
  python3 - "$1" "$2" <<'PY'
import re
import sys

key, value = sys.argv[1], sys.argv[2]
text = open(".env").read()
pattern = re.compile(rf"^#?{re.escape(key)}=.*$", re.MULTILINE)
replacement = f"{key}={value}"
if pattern.search(text):
    text = pattern.sub(replacement, text, count=1)
else:
    text = text.rstrip("\n") + f"\n{replacement}\n"
open(".env", "w").write(text)
PY
}

random_hex() {
  openssl rand -hex "${1:-32}"
}

ask() {
  local prompt="$1" default="$2" reply
  read -r -p "$prompt [$default]: " reply
  echo "${reply:-$default}"
}

ask_secret() {
  local prompt="$1" reply
  read -r -s -p "$prompt (leave blank to skip): " reply
  echo >&2
  echo "$reply"
}

echo
echo "Generating secrets..."
set_var "${PREFIX}__DEBUG" "false"
set_var "${PREFIX}__SECRET_KEY" "$(random_hex 32)"
# A Fernet key is 32 random bytes in url-safe base64, which plain base64 becomes by swapping two characters.
set_var "${PREFIX}__CREDENTIAL_KEY" "$(openssl rand -base64 32 | tr '+/' '-_')"
set_var "${PREFIX}__DB__PASSWORD" "$(random_hex 24)"
set_var "${PREFIX}__BROKER__PASSWORD" "$(random_hex 24)"

superuser_password="$(random_hex 16)"
set_var "${PREFIX}__SETUP__SUPERUSER__PASSWORD" "$superuser_password"

domain="$(ask "Domain this deploys to" "{{ cookiecutter.domain }}")"
set_var "${PREFIX}__DOMAIN" "$domain"
{% if cookiecutter.tls_termination == "self" %}
acme_email="$(ask "Contact email for Let's Encrypt (expiry/revocation notices)" "{{ cookiecutter.author_email }}")"
set_var "${PREFIX}__TLS__ACME_EMAIL" "$acme_email"
{%- else %}
echo
echo "nginx serves plain HTTP here, behind the TLS-terminating load balancer you put in front of it."
echo "Every proxy in that chain has to append to X-Forwarded-For, not replace it."
front_proxies="$(ask "How many proxies sit in front of nginx" "1")"
if ! [[ "$front_proxies" =~ ^[0-9]+$ ]]; then
  echo "Expected a whole number, got '$front_proxies'." >&2
  exit 1
fi
# nginx appends too, so it counts as one more.
set_var "${PREFIX}__TRUSTED_PROXY_COUNT" "$((front_proxies + 1))"
{% endif %}
superuser_username="$(ask "Superuser username" "admin")"
set_var "${PREFIX}__SETUP__SUPERUSER__USERNAME" "$superuser_username"

superuser_email="$(ask "Superuser email" "admin@${domain}")"
set_var "${PREFIX}__SETUP__SUPERUSER__EMAIL" "$superuser_email"

echo
echo "DEBUG=false switches email from console to real SMTP - needed for password reset and"
echo "verification links to actually go anywhere."
smtp_host="$(ask "SMTP host" "")"
if [ -n "$smtp_host" ]; then
  set_var "${PREFIX}__EMAIL__SMTP__HOST" "$smtp_host"
  set_var "${PREFIX}__EMAIL__SMTP__PORT" "$(ask "SMTP port" "587")"
  set_var "${PREFIX}__EMAIL__SMTP__USER" "$(ask "SMTP username" "")"
  set_var "${PREFIX}__EMAIL__SMTP__PASSWORD" "$(ask_secret "SMTP password")"
  set_var "${PREFIX}__EMAIL__DEFAULT_FROM" "$(ask "Default from address" "noreply@${domain}")"
else
  echo "Skipped - fill in ${PREFIX}__EMAIL__SMTP__* in $ENV_FILE yourself before going live, or no email will send."
fi

echo
echo "Object storage: the bundled LocalStack keeps nothing across a restart, so a real deployment"
echo "needs a real S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, ...)."
storage_endpoint="$(ask "S3 endpoint URL (blank keeps the bundled LocalStack)" "")"
if [ -n "$storage_endpoint" ]; then
  set_var "${PREFIX}__STORAGE__ENDPOINT_URL" "$storage_endpoint"
  set_var "${PREFIX}__STORAGE__BUCKET_NAME" "$(ask "Bucket name" "{{ cookiecutter.repo_slug }}")"
  set_var "${PREFIX}__STORAGE__REGION_NAME" "$(ask "Region" "us-east-1")"
  set_var "${PREFIX}__STORAGE__ACCESS_KEY_ID" "$(ask "Access key ID" "")"
  set_var "${PREFIX}__STORAGE__SECRET_ACCESS_KEY" "$(ask_secret "Secret access key")"
else
  echo "Kept LocalStack - uploads will not survive a restart of the storage container."
fi

# Discovered from .env.example itself, not a fixed list - it already carries exactly the
# OAUTH__<PROVIDER>__CLIENT_ID lines this project was generated with (see .env.example's own
# header comment / hooks/post_gen_project.py), so this stays correct no matter how many providers
# "social_login_providers" named at generation time.
oauth_providers="$(grep -oE "^#?${PREFIX}__OAUTH__[A-Z0-9_]+__CLIENT_ID=" "$EXAMPLE_FILE" 2>/dev/null \
  | sed -E "s/^#?${PREFIX}__OAUTH__([A-Z0-9_]+)__CLIENT_ID=/\1/" | sort -u || true)"

if [ -n "$oauth_providers" ]; then
  echo
  echo "Social login provider credentials (leave blank to configure later - that provider's button"
  echo "just won't complete its flow until you do):"
  # Reads the provider list from fd 3, not stdin (fd 0) - ask()/ask_secret() inside the loop body
  # need stdin free to read the real answer, or each one would silently consume the next line of
  # $oauth_providers instead of prompting, and every answer after the first would shift onto the
  # wrong provider/question.
  while IFS= read -r provider <&3; do
    client_id="$(ask "  $provider client ID" "")"
    if [ -n "$client_id" ]; then
      set_var "${PREFIX}__OAUTH__${provider}__CLIENT_ID" "$client_id"
      set_var "${PREFIX}__OAUTH__${provider}__CLIENT_SECRET" "$(ask_secret "  $provider client secret")"
    fi
  done 3<<< "$oauth_providers"
  if echo "$oauth_providers" | grep -qx "OPENID_CONNECT"; then
    echo "  openid_connect also needs ${PREFIX}__OAUTH__OPENID_CONNECT__SERVER_URL and"
    echo "  ...__PROVIDER_ID - set those in $ENV_FILE directly."
  fi
fi

echo
sentry_dsn="$(ask "Backend Sentry DSN" "")"
[ -n "$sentry_dsn" ] && set_var "${PREFIX}__SENTRY__DSN" "$sentry_dsn"

frontend_sentry_dsn="$(ask "Frontend (browser) Sentry DSN" "")"
[ -n "$frontend_sentry_dsn" ] && set_var "NEXT_PUBLIC_SENTRY_DSN" "$frontend_sentry_dsn"

echo
echo "Wrote $ENV_FILE for a real deployment."
echo "Superuser: $superuser_username / $superuser_password - save this, it's only shown once."
echo
{%- if cookiecutter.tls_termination == "self" %}
echo "Point $domain, api.$domain, admin.$domain, and auth.$domain's DNS at this host's public IP"
echo "before running 'docker compose up -d' - certbot needs them resolving for its HTTP-01"
echo "challenge to succeed on first boot. nginx serves a throwaway certificate until it does."
{%- else %}
echo "This template's nginx ({{ cookiecutter.project_slug }}-server/) serves plain HTTP only - put"
echo "a TLS-terminating load balancer or reverse proxy in front of it before going live."
{%- endif %}
