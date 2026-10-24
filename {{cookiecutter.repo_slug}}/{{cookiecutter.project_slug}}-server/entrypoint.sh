#!/bin/sh
set -e
{% if cookiecutter.tls_termination == "self" %}
# nginx's :443 blocks need some certificate to start before certbot has issued the real one.
/server/certificate.sh
{% endif %}
PREFIX={{ cookiecutter.config_prefix }}

# Empty, it would match every request that sent none, letting any of them name its own address.
frontend_key="$(printenv "${PREFIX}__FRONTEND_KEY" || true)"
if [ -z "$frontend_key" ]; then
    echo "${PREFIX}__FRONTEND_KEY is not set: nginx will not start without it (see .env.example)." >&2
    exit 1
fi

# The client is proxy_count - 1 entries from the right: nginx counts itself but has not appended yet.
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

# A burst of ten seconds' worth: a page load asks for a lot at once.
NGINX_REQUESTS_PER_SECOND="$(printenv "${PREFIX}__RATE_LIMITS__REQUESTS_PER_SECOND" || echo 20)"
if [ "$(printenv "${PREFIX}__RATE_LIMITS__ENABLED" || echo true)" = "false" ]; then
    NGINX_LIMIT_REQ=""
else
    NGINX_LIMIT_REQ="limit_req zone=clients burst=$((NGINX_REQUESTS_PER_SECOND * 10)) nodelay;"
fi
export NGINX_REQUESTS_PER_SECOND NGINX_LIMIT_REQ

# Explicit var list, or envsubst would blank nginx's own variables ($host, $remote_addr, ...).
envsubst "$(env | sed -e 's/=.*//' -e 's/^/\$/g')" < /server/template.nginx.conf > /server/nginx.conf
{% if cookiecutter.tls_termination == "self" %}
# Nothing signals certbot's issuance or renewals, so poll: a minute for the first, 12 hours for renewals.
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
