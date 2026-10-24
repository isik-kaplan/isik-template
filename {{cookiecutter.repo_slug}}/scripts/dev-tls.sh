#!/usr/bin/env bash
set -euo pipefail
{% if cookiecutter.tls_termination == "self" %}
echo "tls_termination is \"self\": nginx already serves https off its own certificate (see README.md's TLS" >&2
echo "section). This script only applies to the plain-http stack tls_termination: external generates." >&2
exit 1
{%- else %}
# Local https for the dev stack, so secure-context-only browser APIs (passkeys, service workers) work.
# Uses mkcert when installed; a self-signed certificate otherwise, which Chromium refuses for WebAuthn.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TLS_DIR="$HERE/{{ cookiecutter.project_slug }}-server/dev-tls"
ENV_FILE="$HERE/.env"

read_env() {
  # Not sourced: .env is not a shell script.
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '"'
}

DOMAIN="$(read_env {{ cookiecutter.config_prefix }}__DOMAIN)"
: "${DOMAIN:?{{ cookiecutter.config_prefix }}__DOMAIN is not set in .env}"

# Listed rather than a wildcard, which would not cover the bare domain.
NAMES=("$DOMAIN" "api.$DOMAIN" "admin.$DOMAIN" "auth.$DOMAIN")
SAN="$(printf 'DNS:%s,' "${NAMES[@]}")"
SAN="${SAN%,}"

mkdir -p "$TLS_DIR"

if [ -f "$TLS_DIR/cert.pem" ] && openssl x509 -checkend 86400 -noout -in "$TLS_DIR/cert.pem" 2>/dev/null; then
  # Parsed from -text, not -ext: macOS's LibreSSL has no -ext.
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

# The CA to trust, which for mkcert is its root, not the served leaf.
if command -v mkcert >/dev/null 2>&1; then
  cp "$(mkcert -CAROOT)/rootCA.pem" "$TLS_DIR/ca.pem"
else
  cp "$TLS_DIR/cert.pem" "$TLS_DIR/ca.pem"
fi
chmod 644 "$TLS_DIR/ca.pem"

# Directives, not a server block: included in both server blocks, so :443 serves exactly what :80 does.
cat > "$TLS_DIR/listen.conf" <<CONF
listen 443 ssl;
http2 on;
ssl_certificate     /etc/nginx/extra-listen/cert.pem;
ssl_certificate_key /etc/nginx/extra-listen/key.pem;
CONF

# Without it the frontend's server-side fetches reject the certificate, and every page is a 500.
CA_LINE="NODE_EXTRA_CA_CERTS=/etc/dev-tls/ca.pem"
if ! grep -q "^NODE_EXTRA_CA_CERTS=" "$ENV_FILE"; then
  printf '\n# Written by scripts/dev-tls.sh - the CA the frontend trusts for this stack'"'"'s local https.\n%s\n' \
    "$CA_LINE" >> "$ENV_FILE"
  echo "added $CA_LINE to .env"
fi

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
