import pytest
from django.conf import settings
from django.test import RequestFactory
from isik.django.apps.common.db import open_history_context

from apps.common.middleware.history_context import HistoryContextMiddleware
from apps.users.models.user import User

from {{ cookiecutter.project_slug }} import __version__


def test_a_served_request_records_the_version_that_served_it():
    seen = {}

    def view(request):
        seen.update(open_history_context())

    HistoryContextMiddleware(get_response=view)(RequestFactory().post("/"))

    assert seen["version"] == __version__


@pytest.mark.django_db
def test_a_write_through_a_real_request_is_stamped_with_the_version(client):
    host = f"auth.{settings.PARENT_HOST}"
    user = User.objects.create_user(username="alice", email="alice@example.test", password="old-password")
    client.force_login(user)
    client.get("/v0/browser/v1/auth/session", HTTP_HOST=host)  # primes the csrftoken cookie

    client.post(
        "/v0/browser/v1/account/password/change",
        data={"current_password": "old-password", "new_password": "a-new-password"},
        content_type="application/json",
        HTTP_HOST=host,
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )

    event = User.pgh_event_model.objects.filter(pgh_obj=user, pgh_label="update").latest("pgh_id")
    assert event.pgh_context.metadata["version"] == __version__
