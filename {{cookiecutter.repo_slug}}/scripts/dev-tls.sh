#!/usr/bin/env bash
set -euo pipefail
{% if cookiecutter.tls_termination == "self" %}
# This project terminates its own TLS (tls_termination: self) - nginx already serves :443 off the
# certificate in the letsencrypt volume, so there is no plain-http dev stack for this to upgrade.
echo "tls_termination is \"self\": nginx already serves https off its own certificate (see README.md's TLS" >&2
echo "section). This script only applies to the plain-http stack tls_termination: external generates." >&2
exit 1
{%- else %}
# Local-only https for the plain-http dev stack, so browser APIs that exist only in a secure context
# (WebAuthn/passkeys, service workers, parts of the clipboard API) work on a laptop. It writes a
# certificate and a `listen 443 ssl` snippet into the server's dev-tls/ directory, which both nginx
# server blocks include - empty (the default, and every real deployment) keeps nginx on :80 only.
#
# mkcert when it is installed, because its CA is already in the system and browser trust stores and
# there is no warning to click through. Self-signed otherwise, which still makes the origin secure
# once the warning is accepted - except for WebAuthn, which Chromium refuses on any certificate
# error. `brew install mkcert && mkcert -install` (or your OS's package), then rerun this.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TLS_DIR="$HERE/{{ cookiecutter.project_slug }}-server/dev-tls"
ENV_FILE="$HERE/.env"

read_env() {
  # The value as .env spells it, without sourcing the file - it is not a shell script, and a stray
  # `#` or space in an unrelated line should not decide whether this works.
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '"'
}

DOMAIN="$(read_env {{ cookiecutter.config_prefix }}__DOMAIN)"
: "${DOMAIN:?{{ cookiecutter.config_prefix }}__DOMAIN is not set in .env}"

# The four names nginx answers on, listed rather than a wildcard: `*.{{ cookiecutter.domain }}` would not cover the
# bare domain, and naming them is what the rest of the stack already does.
NAMES=("$DOMAIN" "api.$DOMAIN" "admin.$DOMAIN" "auth.$DOMAIN")
SAN="$(printf 'DNS:%s,' "${NAMES[@]}")"
SAN="${SAN%,}"

mkdir -p "$TLS_DIR"

if [ -f "$TLS_DIR/cert.pem" ] && openssl x509 -checkend 86400 -noout -in "$TLS_DIR/cert.pem" 2>/dev/null; then
  # Read out of -text rather than with -ext: macOS ships LibreSSL, which has no -ext at all, and
  # this branch failing is a script that stops working on its second run.
  HAVE="$(openssl x509 -in "$TLS_DIR/cert.pem" -noout -text \
    | sed -n '/X509v3 Subject Alternative Name/{n;p;}' | tr -d ' \n')"
  if [ "$HAVE" = "$SAN" ]; then
    echo "certificate still valid and covers every name, keeping it"
  else
    echo "certificate covers $HAVE, wanted $SAN - reminting"
    rm -f "$TLS_DIR/cert.pem" "$TLS_DIR/key.pem"
  fi
fi

if [ ! -f "$TLS_DIR/cert.pem" ]; then
  if command -v mkcert >/dev/null 2>&1; then
    echo "minting with mkcert, whose CA your browser already trusts"
    mkcert -cert-file "$TLS_DIR/cert.pem" -key-file "$TLS_DIR/key.pem" "${NAMES[@]}" >/dev/null
  else
    echo "mkcert not found - minting a self-signed certificate (expect a browser warning once per name)"
    echo "  install mkcert and run \`mkcert -install\`, then rerun this, for one with no warning"
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
      -keyout "$TLS_DIR/key.pem" -out "$TLS_DIR/cert.pem" \
      -subj "/CN=$DOMAIN" -addext "subjectAltName=$SAN" 2>/dev/null
  fi
  # nginx's workers read these as an unprivileged user through a read-only bind mount.
  chmod 644 "$TLS_DIR/cert.pem" "$TLS_DIR/key.pem"
fi

# What has to be trusted, which is not always what is served: mkcert signs with a root of its own,
# and a leaf verifies nothing. Node appends this to its own roots (NODE_EXTRA_CA_CERTS), so there is
# no bundle to rebuild - unlike SSL_CERT_FILE, which replaces them.
if command -v mkcert >/dev/null 2>&1; then
  cp "$(mkcert -CAROOT)/rootCA.pem" "$TLS_DIR/ca.pem"
else
  cp "$TLS_DIR/cert.pem" "$TLS_DIR/ca.pem"
fi
chmod 644 "$TLS_DIR/ca.pem"

# Directives, not a server block: included inside both existing server blocks, so :443 serves exactly
# the routes :80 does with nothing duplicated.
cat > "$TLS_DIR/listen.conf" <<CONF
listen 443 ssl;
http2 on;
ssl_certificate     /etc/nginx/extra-listen/cert.pem;
ssl_certificate_key /etc/nginx/extra-listen/key.pem;
CONF

# The frontend fetches this deployment's own API server-side, so over https it is a Node client
# verifying this certificate - and it rejects one nothing told it about, which surfaces as a 500 on
# every page rather than as a certificate error. Written into .env rather than set in compose's
# `environment`, which would override whatever env_file says.
CA_LINE="NODE_EXTRA_CA_CERTS=/etc/dev-tls/ca.pem"
if ! grep -q "^NODE_EXTRA_CA_CERTS=" "$ENV_FILE"; then
  printf '\n# Written by scripts/dev-tls.sh - the CA the frontend trusts for this stack'"'"'s local https.\n%s\n' \
    "$CA_LINE" >> "$ENV_FILE"
  echo "added $CA_LINE to .env"
fi

# The override that mounts this directory and publishes :443 - kept out of the base file so a
# deployment behind its own TLS proxy never claims the port that proxy listens on.
OVERRIDE="docker-compose.dev-tls.yml"
if ! grep -q "^COMPOSE_FILE=" "$ENV_FILE"; then
  printf '\n# Written by scripts/dev-tls.sh - layers the local-https override onto the stack.\n%s\n' \
    "COMPOSE_FILE=docker-compose.yml:$OVERRIDE" >> "$ENV_FILE"
  echo "added COMPOSE_FILE=docker-compose.yml:$OVERRIDE to .env"
elif ! grep -q "^COMPOSE_FILE=.*$OVERRIDE" "$ENV_FILE"; then
  echo "warning: .env already sets COMPOSE_FILE - append :$OVERRIDE to it yourself" >&2
fi

echo "written to $TLS_DIR - now: docker compose up -d --force-recreate server frontend"
echo "then visit https://$DOMAIN"
{%- endif %}
