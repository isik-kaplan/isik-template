"""Edits, deletes and approvals are refused once somebody else has saved since the page loaded."""

import pytest
from django.urls import reverse
from isik.django.apps.common.db.concurrency import assert_concurrency_field_changes
from oauth2_provider.models import get_application_model

from apps.oauth_provider.tests.conftest import permission, set_approval
from conftest import versioned


Application = get_application_model()

MANAGE = "users:manage:user"


def _detail(application):
    return reverse("oauth-applications-detail", args=[application.pk])


def _rename(client, application, name, headers):
    return client.patch(_detail(application), {"name": name}, content_type="application/json", headers=headers)


@pytest.mark.django_db
def test_its_version_moves_on_with_every_write_however_it_is_made(application):
    assert_concurrency_field_changes(application)


@pytest.mark.django_db
def test_reading_one_says_which_version_it_is(client, signed_in, provider, application):
    response = client.get(_detail(application))

    assert response["ETag"] == versioned(application)["If-Match"]


@pytest.mark.django_db
def test_an_edit_answers_with_the_version_it_left(client, signed_in, provider, application):
    read = versioned(application)

    response = _rename(client, application, "Acme Notes 2", read)

    assert response.status_code == 200
    assert response["ETag"] == versioned(application)["If-Match"]
    assert response["ETag"] != read["If-Match"]


@pytest.mark.django_db
def test_an_edit_made_against_an_older_version_is_refused_with_the_current_one(
    client, signed_in, provider, application
):
    read = versioned(application)
    assert _rename(client, application, "Renamed in another tab", read).status_code == 200

    response = _rename(client, application, "Renamed from a stale page", read)

    assert response.status_code == 412
    assert response.json()["code"] == "precondition_failed"
    assert response.json()["current"]["name"] == "Renamed in another tab"
    assert response["ETag"] == versioned(application)["If-Match"]
    application.refresh_from_db()
    assert application.name == "Renamed in another tab"


@pytest.mark.django_db
def test_an_edit_that_names_no_version_is_refused(client, signed_in, provider, application):
    response = _rename(client, application, "Acme Notes 2", {})

    assert response.status_code == 428
    assert response.json()["code"] == "precondition_required"
    application.refresh_from_db()
    assert application.name == "Acme Notes"


@pytest.mark.django_db
def test_deleting_one_from_a_stale_page_is_refused(client, signed_in, provider, application, headless):
    set_approval(application, Application.Approval.DISABLED)
    read = versioned(application)
    assert _rename(client, application, "Renamed in another tab", read).status_code == 200
    headless.prove()

    assert client.delete(_detail(application), headers=read).status_code == 412
    assert Application.objects.filter(pk=application.pk).exists()


@pytest.mark.django_db
def test_switching_off_needs_no_version(client, signed_in, provider, application):
    response = client.post(reverse("oauth-applications-disable", args=[application.pk]))

    assert response.status_code == 200
    assert response["ETag"] == versioned(application)["If-Match"]


@pytest.mark.django_db
def test_approving_what_it_asked_for_before_its_owner_changed_that_is_refused(
    client, signed_in, provider, application, headless
):
    signed_in.is_superuser = True
    signed_in.save()
    headless.prove()
    read = versioned(application)
    application.requested_scopes.add(permission("users:grant:rights"))
    application.save()

    response = client.post(
        reverse("oauth-application-reviews-approve", args=[application.pk]),
        {"approved_scopes": [MANAGE]},
        content_type="application/json",
        headers=read,
    )

    assert response.status_code == 412
    assert sorted(response.json()["current"]["requested_scopes"]) == ["users:grant:rights", MANAGE]
