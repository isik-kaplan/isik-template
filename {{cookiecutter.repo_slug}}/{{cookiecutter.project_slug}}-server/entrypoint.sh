#!/bin/sh
set -e

# Explicit var list, not a bare envsubst < template - nginx's own runtime variables ($host,
# $remote_addr, $http_upgrade, ...) would otherwise be silently replaced with empty strings too,
# since they look identical to shell variable references but aren't in this process's env.
envsubst "$(env | sed -e 's/=.*//' -e 's/^/\$/g')" < /server/template.nginx.conf > /server/nginx.conf

exec nginx -c /server/nginx.conf -g 'daemon off;'
