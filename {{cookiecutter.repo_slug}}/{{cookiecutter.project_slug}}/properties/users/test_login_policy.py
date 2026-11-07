from hypothesis import given
from hypothesis import strategies as st

from apps.users.models.site_settings import SiteSettings


LoginPolicy = SiteSettings.LoginPolicy


@given(lower=st.sampled_from(LoginPolicy), higher=st.sampled_from(LoginPolicy), is_staff=st.booleans())
def test_raising_the_ladder_never_lets_anybody_new_in(lower, higher, is_staff):
    ladder = list(LoginPolicy)
    if ladder.index(lower) > ladder.index(higher):
        lower, higher = higher, lower

    if LoginPolicy.admits(higher, is_staff=is_staff, is_superuser=False):
        assert LoginPolicy.admits(lower, is_staff=is_staff, is_superuser=False)
    assert LoginPolicy.admits(higher, is_staff=is_staff, is_superuser=True)
