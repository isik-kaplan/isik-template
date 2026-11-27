"""The shared cache rate limits count in, as CACHE__BACKEND names it."""

from django.core.exceptions import ImproperlyConfigured


BACKENDS = ("redis", "database")


def configured_caches(backend, host, port, password):
    """Fails startup on a backend that isn't one, or Redis with nowhere to find it."""
    if backend == "redis":
        if not host:
            raise ImproperlyConfigured("CACHE__BACKEND is redis, so CACHE__HOST names where it runs")
        return {
            "default": {
                "BACKEND": "django.core.cache.backends.redis.RedisCache",
                "LOCATION": f"redis://{host}:{port}/0",
                "OPTIONS": {"password": password or None},
            },
        }
    if backend == "database":
        # Made by `createcachetable` (entrypoint.sh), not a migration.
        return {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "cache"}}
    raise ImproperlyConfigured(f"CACHE__BACKEND is {backend!r}; it is one of {', '.join(BACKENDS)}")
