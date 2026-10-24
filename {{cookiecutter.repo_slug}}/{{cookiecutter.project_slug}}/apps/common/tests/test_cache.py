"""The configured cache is shared by every process, so a rate limit holds wherever requests land.

The rest of the suite runs on a per-process cache, so these build the configured one themselves.
"""

import uuid

{% if cookiecutter.cache == "database" -%}
import pytest
{% endif -%}
from django.utils.module_loading import import_string

from conftest import CONFIGURED_CACHES


def _connection():
    """A new client of the configured cache, as another process would open one."""
    configured = {**CONFIGURED_CACHES["default"]}
    backend = import_string(configured.pop("BACKEND"))
    return backend(configured.pop("LOCATION"), configured)


def test_it_is_not_a_cache_of_each_process_s_own():
    assert CONFIGURED_CACHES["default"]["BACKEND"] in {
        "django.core.cache.backends.redis.RedisCache",
        "django.core.cache.backends.db.DatabaseCache",
    }
{%- if cookiecutter.cache == "database" %}


@pytest.fixture
def cache_table(db, settings):
    """The table entrypoint.sh's createcachetable makes before the backend starts."""
    from django.core.management import call_command

    settings.CACHES = CONFIGURED_CACHES
    call_command("createcachetable")
{%- endif %}


{% if cookiecutter.cache == "database" -%}
@pytest.mark.usefixtures("cache_table")
{% endif -%}
def test_what_one_process_counts_another_reads():
    key = f"shared-{uuid.uuid4().hex}"
    one, another = _connection(), _connection()
    try:
        one.set(key, 1, 60)
        another.incr(key)

        assert one.get(key) == 2
    finally:
        one.delete(key)
