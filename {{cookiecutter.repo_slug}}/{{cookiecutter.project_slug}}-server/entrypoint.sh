#!/bin/sh
set -e
{% if cookiecutter.tls_termination == "self" %}
# nginx's :443 blocks need *some* certificate to start on a brand new volume. certbot (see docker-compose.yml's
# certbot service) gets the real one via the webroot challenge, which only needs :80 answering.
/server/certificate.sh
{% endif %}
# Explicit var list, not a bare envsubst < template - nginx's own runtime variables ($host,
# $remote_addr, $http_upgrade, ...) would otherwise be silently replaced with empty strings too,
# since they look identical to shell variable references but aren't in this process's env.
envsubst "$(env | sed -e 's/=.*//' -e 's/^/\$/g')" < /server/template.nginx.conf > /server/nginx.conf
{% if cookiecutter.tls_termination == "self" %}
# Nothing tells nginx when certbot has issued or renewed the certificate on the shared volume, so this polls:
# within a minute of the first issuance, and every 12 hours for renewals, which land behind the same path.
(
    elapsed=0
    while true; do
        sleep 60
        elapsed=$((elapsed + 60))
        before="$(readlink /etc/nginx/certificate)"
        /server/certificate.sh
        if [ "$(readlink /etc/nginx/certificate)" != "$before" ] || [ "$elapsed" -ge 43200 ]; then
            nginx -s reload
            elapsed=0
        fi
    done
) &
{% endif %}
exec nginx -c /server/nginx.conf -g 'daemon off;'
