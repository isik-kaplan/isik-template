"""Whatever CACHE__* says, the cache is one every process shares, or startup fails."""

import pytest
from django.core.exceptions import ImproperlyConfigured
from hypothesis import example, given
from hypothesis import strategies as st

from apps.common.caches import BACKENDS, configured_caches


@given(
    backend=st.one_of(st.sampled_from(BACKENDS), st.text()),
    host=st.one_of(st.just(""), st.from_regex(r"[a-z][a-z0-9.-]{0,20}", fullmatch=True)),
    port=st.integers(1, 65535).map(str),
    password=st.text(),
)
# Each way the setting can go, pinned: a draw alone reaches Redis with a host one time in eight.
@example(backend="redis", host="cache", port="6379", password="secret")
@example(backend="redis", host="", port="6379", password="")
@example(backend="database", host="", port="6379", password="")
@example(backend="memcached", host="cache", port="6379", password="")
def test_the_cache_is_shared_or_startup_fails(backend, host, port, password):
    if backend == "database" or (backend == "redis" and host):
        default = configured_caches(backend, host, port, password)["default"]
        if backend == "redis":
            assert default["LOCATION"] == f"redis://{host}:{port}/0"
            assert default["OPTIONS"] == {"password": password or None}
        else:
            assert default == {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "cache"}
    else:
        with pytest.raises(ImproperlyConfigured):
            configured_caches(backend, host, port, password)
