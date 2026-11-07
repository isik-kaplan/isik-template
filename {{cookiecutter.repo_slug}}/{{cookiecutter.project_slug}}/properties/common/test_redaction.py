from urllib.parse import urlencode

from hypothesis import given
from hypothesis import strategies as st

from apps.common.logging.redaction import LOGGABLE, REDACTED, values_of
from apps.common.logging.scrub import scrub_event


@given(st.dictionaries(st.text(), st.text()))
def test_only_an_allowlisted_name_keeps_its_value(sent):
    kept = values_of(sent.items())

    assert kept.keys() == sent.keys()
    assert all(kept[name] == (value if name in LOGGABLE else REDACTED) for name, value in sent.items())


@given(st.dictionaries(st.text(min_size=1), st.text()))
def test_sentry_narrows_a_query_string_the_same_way(sent):
    event = scrub_event({"request": {"query_string": urlencode(sent)}}, hint=None)

    for name, value in event["request"]["query_string"].items():
        assert value == (sent[name] if name in LOGGABLE else REDACTED)
