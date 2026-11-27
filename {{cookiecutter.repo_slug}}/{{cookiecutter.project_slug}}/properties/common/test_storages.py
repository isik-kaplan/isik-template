"""Whatever STORAGE__* says, uploads go to the volume or a reachable bucket, or startup fails."""

import pytest
from django.core.exceptions import ImproperlyConfigured
from hypothesis import example, given
from hypothesis import strategies as st

from apps.common.storages import BACKENDS, configured_storage


SETTING = st.one_of(st.just(""), st.from_regex(r"[A-Za-z0-9-]{1,20}", fullmatch=True))
NEEDED = ("bucket_name", "access_key_id", "secret_access_key", "region_name")
NAMES = ("bucket_name", "endpoint_url", "access_key_id", "secret_access_key", "region_name")
EMPTY = dict.fromkeys(NAMES, "") | {"addressing_style": "path"}
FILLED = dict.fromkeys(NAMES, "x") | {"addressing_style": "path"}


@given(
    backend=st.one_of(st.sampled_from(BACKENDS), st.text()),
    given_settings=st.fixed_dictionaries(
        {
            "bucket_name": SETTING,
            "endpoint_url": SETTING,
            "access_key_id": SETTING,
            "secret_access_key": SETTING,
            "region_name": SETTING,
            "addressing_style": st.sampled_from(["path", "virtual"]),
        }
    ),
)
# Each way the settings can go, pinned: a draw alone fills all four a bucket needs one time in sixteen.
@example(backend="disk", given_settings=EMPTY)
@example(backend="s3", given_settings=FILLED | {"endpoint_url": ""})
@example(backend="s3", given_settings=FILLED | {"bucket_name": "", "addressing_style": "virtual"})
@example(backend="gcs", given_settings=FILLED)
def test_uploads_go_somewhere_reachable_or_startup_fails(backend, given_settings):
    if backend == "disk":
        assert configured_storage(backend, **given_settings)["OPTIONS"] == {"location": "/media"}
    elif backend == "s3" and all(given_settings[name] for name in NEEDED):
        options = configured_storage(backend, **given_settings)["OPTIONS"]
        assert options["bucket_name"] == given_settings["bucket_name"]
        assert options["endpoint_url"] == (given_settings["endpoint_url"] or None)
        assert options["addressing_style"] == given_settings["addressing_style"]
    else:
        with pytest.raises(ImproperlyConfigured):
            configured_storage(backend, **given_settings)
