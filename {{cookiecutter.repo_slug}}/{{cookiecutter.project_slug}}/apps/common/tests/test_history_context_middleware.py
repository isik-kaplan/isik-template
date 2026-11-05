import pytest
from django.conf import settings
from django.test import RequestFactory
from isik.django.apps.common.db import open_history_context
from isik.django.apps.common.middleware import HistoryContextMiddleware

from apps.users.models.user import User

from {{ cookiecutter.project_slug }} import __version__
from {{ cookiecutter.project_slug }}.config import CONFIG as config


def test_a_served_request_records_the_version_that_served_it():
    seen = {}

    def view(request):
        seen.update(open_history_context())

    HistoryContextMiddleware(get_response=view)(RequestFactory().post("/", HTTP_X_REQUEST_ID="01JB4F"))

    assert (seen["version"], seen["build"], seen["request_id"]) == (__version__, config.BUILD, "01JB4F")


def test_a_request_nginx_never_named_still_gets_an_id():
    """Tests and anything else reaching Django directly; a row with no id would lead nowhere."""
    seen = {}

    def view(request):
        seen.update(open_history_context())

    HistoryContextMiddleware(get_response=view)(RequestFactory().post("/"))

    assert len(seen["request_id"]) == 32


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
