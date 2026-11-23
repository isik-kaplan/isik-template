from types import SimpleNamespace

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.http import Http404
from django.test import RequestFactory, override_settings
from hypothesis import given
from hypothesis import strategies as st

from apps.users.backends.superusers_only_without_passwords import SuperusersOnlyWithoutPasswordsMixin
from apps.users.headless_urls import with_passwords_only
from apps.users.social_login import reauthentication_methods, social_login_only


PROVIDER_IDS = st.lists(st.sampled_from(["google", "apple", "github", "test-idp"]), max_size=3, unique=True)


@given(only=st.booleans(), provider_ids=PROVIDER_IDS, debug=st.booleans())
def test_only_without_providers_fails_startup_outside_development(only, provider_ids, debug):
    if only and not provider_ids and not debug:
        with pytest.raises(ImproperlyConfigured):
            social_login_only(only, provider_ids, debug)
    else:
        assert social_login_only(only, provider_ids, debug) is only


@given(only=st.booleans())
def test_a_code_by_email_takes_the_password_place_without_passwords(only):
    methods = reauthentication_methods(only)
    assert ("code" in methods, "password" in methods) == (only, not only)
    assert "mfa" in methods


class Finds:
    """Stands in for the password backend under the mixin: whoever `found` is, the password matched."""

    found = None

    def authenticate(self, request, **credentials):
        return self.found


class Backend(SuperusersOnlyWithoutPasswordsMixin, Finds):
    pass


@given(only=st.booleans(), is_superuser=st.booleans(), found=st.booleans())
def test_without_passwords_a_password_signs_in_only_a_superuser(only, is_superuser, found):
    user = SimpleNamespace(is_superuser=is_superuser) if found else None
    backend = Backend()
    backend.found = user
    with override_settings(SOCIAL_LOGIN_ONLY=only):
        signed_in = backend.authenticate(None, username="someone", password="secret")
    assert signed_in is (user if (not only or is_superuser) else None)


@given(only=st.booleans())
def test_a_password_route_is_not_found_without_passwords(only):
    request = RequestFactory().post("/")
    route = with_passwords_only(lambda asked: ("answered", asked))
    with override_settings(SOCIAL_LOGIN_ONLY=only):
        if only:
            with pytest.raises(Http404):
                route(request)
        else:
            assert route(request) == ("answered", request)
    assert route.needs_passwords is True
