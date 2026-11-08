"""The provider's startup checks, cleanup and admin, each stated over whatever it is handed."""

from datetime import timedelta
from io import StringIO

import pytest
from django.contrib import admin
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.db import transaction
from django.test import RequestFactory
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from oauth2_provider.models import get_access_token_model, get_application_model

from apps.oauth_provider import urls
from apps.oauth_provider.checks import every_toolkit_route_is_decided
from apps.oauth_provider.mode import MODES, oauth_provider_mode
from apps.oauth_provider.tasks import clear_expired_tokens
from apps.oauth_provider.tests import conftest as oauth


# Fixtures, shared the way the example suite's conftests share them.
alice = oauth.alice
application = oauth.application


AccessToken = get_access_token_model()
Application = get_application_model()
NAME = st.from_regex(r"[a-z][a-z-]{0,15}", fullmatch=True)


@pytest.mark.parametrize("mode", [*MODES, "on", ""])
@pytest.mark.parametrize("keyed", [False, True])
@given(key=st.text(min_size=1, max_size=10))
def test_a_mode_is_taken_only_if_known_and_keyed_unless_off(mode, keyed, key):
    key = key if keyed else ""
    if mode in MODES and (mode == "off" or key):
        assert oauth_provider_mode(mode, key) == mode
    else:
        with pytest.raises(ImproperlyConfigured):
            oauth_provider_mode(mode, key)


@pytest.mark.parametrize("where", ["shipped", "decided", "both"])
@given(extra=st.sets(NAME, min_size=1, max_size=3))
def test_a_route_on_only_one_side_is_named_by_the_check(monkeypatch, where, extra):
    shipped = urls.shipped_route_names()
    extra = extra - shipped - urls.SERVED - urls.OVERRIDDEN - urls.NOT_SERVED
    with monkeypatch.context() as patched:
        if where in ("shipped", "both"):
            patched.setattr(urls, "shipped_route_names", lambda: shipped | extra)
        if where in ("decided", "both"):
            patched.setattr(urls, "NOT_SERVED", urls.NOT_SERVED | {f"{name}-gone" for name in extra})

        ids = [error.id for error in every_toolkit_route_is_decided(app_configs=None)]

    expected = []
    if where in ("shipped", "both") and extra:
        expected.append("oauth_provider.E002")
    if where in ("decided", "both") and extra:
        expected.append("oauth_provider.E003")
    assert ids == expected


@pytest.mark.django_db
@pytest.mark.parametrize("through", ["task", "command"])
@given(ages=st.lists(st.integers(-48, 48).filter(bool), max_size=6))
def test_clearing_deletes_exactly_the_expired_tokens(application, logged, through, ages):
    with transaction.atomic():
        now = timezone.now()
        for index, hours in enumerate(ages):
            AccessToken.objects.create(
                user=application.user, application=application, token=f"t{index}", expires=now + timedelta(hours=hours)
            )
        logged.clear()

        if through == "command":
            call_command("clear_expired_tokens", stdout=StringIO())
        else:
            clear_expired_tokens()

        assert AccessToken.objects.filter(application=application).count() == sum(hours > 0 for hours in ages)
        assert [line["deleted"] for line in logged if line["event"] == "oauth.expired_tokens_cleared"] == [
            sum(hours < 0 for hours in ages)
        ]
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(superuser=st.booleans())
def test_nobody_adds_or_changes_an_application_in_the_admin(admin_user, superuser):
    model_admin = admin.site._registry[Application]
    request = RequestFactory().get("/")
    request.user = admin_user
    admin_user.is_superuser = superuser

    assert not model_admin.has_add_permission(request)
    assert not model_admin.has_change_permission(request)
    assert not model_admin.has_change_permission(request, Application())
