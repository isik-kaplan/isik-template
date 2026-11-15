import pytest
from django.conf import settings
from django.test import RequestFactory
from isik.django.apps.common.db import open_history_context
from isik.django.apps.common.middleware import HistoryContextMiddleware

from apps.users.models.user import User

from {{ cookiecutter.project_slug }} import __version__
from {{ cookiecutter.project_slug }}.config import CONFIG as config


# What nginx's $request_id looks like.
NGINX_ID = "8a25d505ac73f1e04d49ce32aa71969b"


def _context_of(request):
    seen = {}

    def view(request):
        seen.update(open_history_context())

    HistoryContextMiddleware(get_response=view)(request)
    return seen


def test_a_served_request_records_the_version_that_served_it_and_what_it_was_part_of():
    """The request's own id is Django's; nginx's groups it with whatever else one page load caused."""
    seen = _context_of(RequestFactory().post("/", HTTP_X_REQUEST_ID=NGINX_ID))

    assert (seen["version"], seen["build"], seen["correlation_id"]) == (__version__, config.BUILD, NGINX_ID)
    assert seen["request_id"] != NGINX_ID


def test_a_request_nginx_never_named_is_its_own_correlation():
    """Tests and anything else reaching Django directly; a row with no id would lead nowhere."""
    seen = _context_of(RequestFactory().post("/"))

    assert seen["correlation_id"] == seen["request_id"]


@pytest.mark.django_db
def test_a_write_through_a_real_request_is_stamped_with_the_version(client):
    host = f"auth.{settings.PARENT_HOST}"
    user = User.objects.create_user(username="alice", email="alice@example.test", password="old-password")
    client.force_login(user)
    client.get("/v0/browser/auth/session", HTTP_HOST=host)  # primes the csrftoken cookie

    client.post(
        "/v0/browser/account/password/change",
        data={"current_password": "old-password", "new_password": "a-new-password"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )

    event = User.pgh_event_model.objects.filter(pgh_obj=user, pgh_label="update").latest("pgh_id")
    assert event.pgh_context.metadata["version"] == __version__
