import pytest
from django.core.exceptions import ValidationError
from hypothesis import given
from hypothesis import strategies as st

from apps.oauth_provider.api.fields.redirect_uris import RedirectURIsField


SEGMENT = st.text(st.characters(min_codepoint=97, max_codepoint=122), min_size=1, max_size=8)
URI = st.builds(lambda host, path: f"https://{host}.test/{path}", SEGMENT, SEGMENT)


@given(uris=st.lists(URI, min_size=1, max_size=4))
def test_a_list_is_stored_as_dot_keeps_it_and_read_back_as_the_same_list(uris):
    field = RedirectURIsField()

    stored = field.run_validation(uris)

    assert stored == " ".join(uris)
    assert field.to_representation(stored) == uris


@given(uris=st.lists(URI, min_size=1, max_size=3), scheme=st.sampled_from(["ftp", "javascript", "custom-app", "data"]))
def test_one_uri_on_a_scheme_not_allowed_refuses_the_list(uris, scheme):
    # DOT's validator raises Django's error; the exception handler answers it with a 400.
    with pytest.raises(ValidationError, match="invalid_scheme"):
        RedirectURIsField().run_validation([*uris, f"{scheme}://client.test/cb"])
