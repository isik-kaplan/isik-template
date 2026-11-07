import logging

import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

from apps.common.logging import DECLARED, declare
from apps.common.logging.events import NAME_SHAPE


@given(st.from_regex(NAME_SHAPE, fullmatch=True))
def test_whatever_declare_accepts_it_accepts_exactly_once(name):
    assume(name not in DECLARED)
    declare(name, logging.INFO)
    try:
        with pytest.raises(ValueError, match="declared twice"):
            declare(name, logging.INFO)
    finally:
        del DECLARED[name]
