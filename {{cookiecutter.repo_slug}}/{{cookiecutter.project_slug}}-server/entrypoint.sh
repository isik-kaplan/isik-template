#!/bin/sh
set -e
PREFIX={{ cookiecutter.config_prefix }}

# self: nginx serves https off certbot's certificate. external: a load balancer in front does, and sends http.
tls="$(printenv "${PREFIX}__TLS__TERMINATION" || echo {{ cookiecutter.tls_termination }})"
case "$tls" in
    self) other=external ;;
    external) other=self ;;
    *)
        echo "${PREFIX}__TLS__TERMINATION is \"$tls\"; it is self or external." >&2
        exit 1
        ;;
esac
if [ "$tls" = self ]; then
    # nginx's :443 blocks need some certificate to start before certbot has issued the real one.
    /server/certificate.sh
fi

# Empty, it would match every request that sent none, letting any of them name its own address.
frontend_key="$(printenv "${PREFIX}__FRONTEND_KEY" || true)"
if [ -z "$frontend_key" ]; then
    echo "${PREFIX}__FRONTEND_KEY is not set: nginx will not start without it (see .env.example)." >&2
    exit 1
fi

# The client is proxy_count - 1 entries from the right: nginx counts itself but has not appended yet.
# Unset or empty: nginx alone in self mode, the load balancer plus nginx in external.
proxy_count="$(printenv "${PREFIX}__TRUSTED_PROXY_COUNT" || true)"
[ -n "$proxy_count" ] || proxy_count="$([ "$tls" = self ] && echo 1 || echo 2)"
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
# The other mode's servers out first, so nginx loads only this one's.
sed "/^    # BEGIN tls=$other\$/,/^    # END tls=$other\$/d" /server/template.nginx.conf |
    envsubst "$(env | sed -e 's/=.*//' -e 's/^/\$/g')" > /server/nginx.conf
if [ "$tls" = self ]; then
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
fi
exec nginx -c /server/nginx.conf -g 'daemon off;'
