from hypothesis import given
from hypothesis import strategies as st

from apps.oauth_provider.device_codes import ALPHABET, LENGTH, as_stored, user_code


def test_a_code_is_eight_consonants():
    # `secrets` draws, not Hypothesis, so this is a sample rather than a search.
    for code in (user_code() for _ in range(200)):
        assert len(code) == LENGTH
        assert set(code) <= set(ALPHABET)


CODE = st.text(st.sampled_from(ALPHABET), min_size=LENGTH, max_size=LENGTH)
NOISE = st.sampled_from(["", " ", "-", "  ", "\t", "\n"])


@given(code=CODE, noise=st.lists(NOISE, min_size=LENGTH + 1, max_size=LENGTH + 1), lower=st.lists(st.booleans()))
def test_however_a_code_is_typed_it_reads_as_the_one_issued(code, noise, lower):
    """Spaces, hyphens and case are how people copy a code off a screen, never part of it."""
    typed = noise[0] + "".join(
        (letter.lower() if index < len(lower) and lower[index] else letter) + noise[index + 1]
        for index, letter in enumerate(code)
    )

    assert as_stored(typed) == code
