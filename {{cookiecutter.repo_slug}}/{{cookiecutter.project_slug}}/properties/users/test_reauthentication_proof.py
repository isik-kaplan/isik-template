from urllib.parse import parse_qsl, urlsplit

from hypothesis import given
from hypothesis import strategies as st

from apps.users.reauthentication import proof


# Surrogates are the one thing UTF-8 cannot encode.
_TEXT = st.text(st.characters(exclude_categories=("Cs",)))


@given(
    path=st.sampled_from(["/", "/auth/prove", "http://example.test/a/b"]),
    existing=st.dictionaries(_TEXT.filter(bool), _TEXT, max_size=3),
    added=st.dictionaries(_TEXT.filter(bool), _TEXT, min_size=1, max_size=3),
)
def test_with_query_keeps_what_the_url_had_and_adds_the_rest(path, existing, added):
    url = proof.with_query(path, existing)

    result = urlsplit(proof.with_query(url, added))

    assert result.path == urlsplit(path).path
    assert parse_qsl(result.query, keep_blank_values=True) == [*existing.items(), *added.items()]
