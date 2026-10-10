#!/bin/sh
# Points nginx's certificate path at certbot's certificate once there is one, and at a throwaway self-signed one
# until then. Run before nginx starts and before each of its periodic reloads (entrypoint.sh).
set -e
DOMAIN="{{ '${' + cookiecutter.config_prefix + '__DOMAIN}' }}"
LIVE_DIR="/etc/letsencrypt/live/$DOMAIN"
# Never inside certbot's live directory: certbot refuses to issue into one it didn't create.
PLACEHOLDER_DIR=/etc/nginx/placeholder-cert

if [ -f "$LIVE_DIR/fullchain.pem" ]; then
    ln -sfn "$LIVE_DIR" /etc/nginx/certificate
    exit 0
fi
if [ ! -f "$PLACEHOLDER_DIR/fullchain.pem" ]; then
    mkdir -p "$PLACEHOLDER_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$PLACEHOLDER_DIR/privkey.pem" -out "$PLACEHOLDER_DIR/fullchain.pem" \
        -subj "/CN=$DOMAIN" 2>/dev/null
fi
ln -sfn "$PLACEHOLDER_DIR" /etc/nginx/certificate
