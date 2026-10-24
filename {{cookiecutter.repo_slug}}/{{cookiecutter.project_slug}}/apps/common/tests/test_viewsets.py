"""A dead session cookie is cleared by isik's DeadSessionCookieMiddleware; the header and its placement are ours."""

import pytest
from django.conf import settings


MIDDLEWARE = "isik.django.apps.common.middleware.DeadSessionCookieMiddleware"


def test_it_runs_after_authentication_decides_who_is_signed_in():
    middleware = settings.MIDDLEWARE
    assert middleware.index(MIDDLEWARE) > middleware.index("django.contrib.auth.middleware.AuthenticationMiddleware")


def test_the_header_is_one_a_cross_origin_frontend_can_read():
    """The frontend calls the API from another origin, where an unexposed header reads as absent."""
    assert settings.DEAD_SESSION_HEADER in settings.CORS_EXPOSE_HEADERS


@pytest.mark.django_db
def test_a_dead_session_cookie_is_cleared_on_the_domain_it_was_set_on(client):
    """A deletion without the session cookie's domain is a different cookie, and the real one stays."""
    client.cookies[settings.SESSION_COOKIE_NAME] = "a-dead-session"

    response = client.get("/v0/users/me/")

    cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert (cookie.value, cookie["max-age"], cookie["domain"]) == ("", 0, settings.SESSION_COOKIE_DOMAIN)
    assert settings.DEAD_SESSION_HEADER in response
