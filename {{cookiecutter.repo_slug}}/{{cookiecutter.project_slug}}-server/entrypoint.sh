#!/bin/sh
set -e
{% if cookiecutter.tls_termination == "self" %}
# A throwaway, 1-day self-signed certificate - only so nginx has *something* to load at the path
# its own :443 server block names and can start at all on a brand new volume. certbot (see
# docker-compose.yml's certbot service) overwrites this with a real one via the webroot challenge,
# which only needs this container answering on :80 - not a valid cert on :443 - to succeed.
DOMAIN="{{ '${' + cookiecutter.config_prefix + '__DOMAIN}' }}"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
    mkdir -p "$CERT_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" \
        -subj "/CN=$DOMAIN" 2>/dev/null
fi
{% endif %}
# Explicit var list, not a bare envsubst < template - nginx's own runtime variables ($host,
# $remote_addr, $http_upgrade, ...) would otherwise be silently replaced with empty strings too,
# since they look identical to shell variable references but aren't in this process's env.
envsubst "$(env | sed -e 's/=.*//' -e 's/^/\$/g')" < /server/template.nginx.conf > /server/nginx.conf
{% if cookiecutter.tls_termination == "self" %}
# Nothing here tells nginx when certbot has renewed the certificate on the shared volume - a plain
# periodic reload (cheap, non-disruptive) is what picks up the new files, rather than wiring any
# cross-container signal between this and the certbot service.
( while true; do sleep 43200; nginx -s reload; done ) &
{% endif %}
exec nginx -c /server/nginx.conf -g 'daemon off;'
