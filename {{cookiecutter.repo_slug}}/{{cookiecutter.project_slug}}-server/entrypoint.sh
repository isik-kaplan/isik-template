#!/bin/sh
set -e
{% if cookiecutter.tls_termination == "self" %}
# nginx's :443 blocks need *some* certificate to start on a brand new volume. certbot (see docker-compose.yml's
# certbot service) gets the real one via the webroot challenge, which only needs :80 answering.
/server/certificate.sh
{% endif %}
PREFIX={{ cookiecutter.config_prefix }}

# The key the frontend proves its fetches with (template.nginx.conf's $client_ip). Empty, it would
# match every request that sent none, and let any of them name its own address.
frontend_key="$(printenv "${PREFIX}__FRONTEND_KEY" || true)"
if [ -z "$frontend_key" ]; then
    echo "${PREFIX}__FRONTEND_KEY is not set: nginx will not start without it (see .env.example)." >&2
    exit 1
fi

# The client is the entry this many from the right of X-Forwarded-For as it reaches nginx: every
# trusted proxy appends, nginx included, and nginx has not appended yet. None at all means nobody in
# front of nginx is trusted, so the pattern never matches and the answer is the peer's own address.
proxy_count="$(printenv "${PREFIX}__TRUSTED_PROXY_COUNT" || echo {% if cookiecutter.tls_termination == "self" %}1{% else %}2{% endif %})"
hops=$((proxy_count - 1))
if [ "$hops" -le 0 ]; then
    # Still naming the capture the map reads, which nginx refuses to start without.
    NGINX_FORWARDED_CLIENT_PATTERN='~^(?<forwarded>)(?!)'
else
    NGINX_FORWARDED_CLIENT_PATTERN='~(?<forwarded>[^,\s]+)\s*'
    i=1
    while [ "$i" -lt "$hops" ]; do
        NGINX_FORWARDED_CLIENT_PATTERN="${NGINX_FORWARDED_CLIENT_PATTERN},\s*[^,\s]+\s*"
        i=$((i + 1))
    done
    NGINX_FORWARDED_CLIENT_PATTERN="${NGINX_FORWARDED_CLIENT_PATTERN}\$"
fi
export NGINX_FORWARDED_CLIENT_PATTERN

# A burst of ten seconds' worth, answered at once: a page asks for a lot together, then nothing for a while.
NGINX_REQUESTS_PER_SECOND="$(printenv "${PREFIX}__RATE_LIMITS__REQUESTS_PER_SECOND" || echo 20)"
if [ "$(printenv "${PREFIX}__RATE_LIMITS__ENABLED" || echo true)" = "false" ]; then
    NGINX_LIMIT_REQ=""
else
    NGINX_LIMIT_REQ="limit_req zone=clients burst=$((NGINX_REQUESTS_PER_SECOND * 10)) nodelay;"
fi
export NGINX_REQUESTS_PER_SECOND NGINX_LIMIT_REQ

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
