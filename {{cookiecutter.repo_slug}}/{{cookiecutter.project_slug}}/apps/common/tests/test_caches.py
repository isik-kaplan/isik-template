"""CACHE__BACKEND picks where rate limits count, and a setting that can't work fails startup."""

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.common.caches import configured_caches


def test_redis_is_found_where_its_host_and_port_say():
    assert configured_caches("redis", "cache", "6379", "secret") == {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": "redis://cache:6379/0",
            "OPTIONS": {"password": "secret"},
        },
    }


def test_redis_with_no_password_sends_none():
    assert configured_caches("redis", "cache", "6379", "")["default"]["OPTIONS"] == {"password": None}


def test_redis_with_no_host_fails_startup():
    with pytest.raises(ImproperlyConfigured) as error:
        configured_caches("redis", "", "6379", "secret")
    assert str(error.value) == "CACHE__BACKEND is redis, so CACHE__HOST names where it runs"


def test_the_database_keeps_it_in_its_cache_table():
    assert configured_caches("database", "", "6379", "") == {
        "default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "cache"},
    }


def test_a_backend_that_is_neither_fails_startup():
    with pytest.raises(ImproperlyConfigured) as error:
        configured_caches("memcached", "cache", "6379", "")
    assert str(error.value) == "CACHE__BACKEND is 'memcached'; it is one of redis, database"
