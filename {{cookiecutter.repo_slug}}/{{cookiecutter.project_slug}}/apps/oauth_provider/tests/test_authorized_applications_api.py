from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from oauth2_provider.models import get_access_token_model, get_application_model, get_refresh_token_model

from apps.oauth_provider.tests.conftest import auth_host, make_application, o, tokens_for
from apps.users.models.user import User


Application = get_application_model()
AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()

LIST = reverse("authorized-applications-list")


def _detail(pk):
    return reverse("authorized-applications-detail", args=[pk])


def _access(user, application, scope, created=None, token=None):
    access = AccessToken.objects.create(
        user=user,
        application=application,
        token=token or f"access-{AccessToken.objects.count()}",
        scope=scope,
        expires=timezone.now() + timedelta(hours=1),
    )
    if created:
        AccessToken.objects.filter(pk=access.pk).update(created=created)
    return access


def _refresh(user, application, access=None):
    return RefreshToken.objects.create(
        user=user, application=application, token=f"refresh-{RefreshToken.objects.count()}", access_token=access
    )


@pytest.fixture
def another(db, alice):
    return make_application(name="beta Sync", user=alice, client_type="public")


@pytest.mark.django_db
def test_somebody_signed_out_is_refused(client):
    assert client.get(LIST).status_code in (401, 403)


@pytest.mark.django_db
def test_each_application_is_one_row_with_every_scope_it_holds_and_when_it_was_first_let_in(
    client, signed_in, application, another
):
    first = timezone.now() - timedelta(days=3)
    _access(signed_in, application, "openid email")
    _access(signed_in, application, "openid", created=first)
    _access(signed_in, another, "profile")

    rows = client.get(LIST).json()

    assert [row["name"] for row in rows] == ["Acme Notes", "beta Sync"]
    assert rows[0]["id"] == application.pk
    assert rows[0]["scopes"] == ["email", "openid"]
    assert rows[0]["granted_at"] == first.isoformat().replace("+00:00", "Z")
    assert rows[1]["scopes"] == ["profile"]


@pytest.mark.django_db
def test_applications_are_listed_by_name_whatever_its_case(client, signed_in, alice):
    for name in ["aZtool", "a_tool", "Beta"]:
        _access(signed_in, make_application(name=name, user=alice), "openid")

    assert [row["name"] for row in client.get(LIST).json()] == ["a_tool", "aZtool", "Beta"]


@pytest.mark.django_db
def test_an_application_left_holding_only_a_refresh_token_still_has_access_and_is_listed(
    client, signed_in, application
):
    _refresh(signed_in, application)

    [row] = client.get(LIST).json()

    assert (row["id"], row["name"], row["scopes"]) == (application.pk, "Acme Notes", [])


@pytest.mark.django_db
def test_a_revoked_refresh_token_holds_nothing(client, signed_in, application):
    _refresh(signed_in, application).revoke()

    assert client.get(LIST).json() == []


@pytest.mark.django_db
def test_somebody_elses_grants_are_not_listed(client, signed_in, application):
    bob = User.objects.create_user(username="bob")
    _access(bob, application, "openid")
    _refresh(bob, application)

    assert client.get(LIST).json() == []


@pytest.mark.django_db
def test_shutting_an_application_out_needs_a_proof(client, signed_in, application):
    _access(signed_in, application, "openid")

    response = client.delete(_detail(application.pk))

    assert response.status_code == 403
    assert AccessToken.objects.exists()


@pytest.mark.django_db
def test_shutting_an_application_out_revokes_every_token_it_holds(client, signed_in, application, headless):
    access = _access(signed_in, application, "openid")
    _refresh(signed_in, application, access)
    _refresh(signed_in, application)
    _access(signed_in, application, "email")
    bob = User.objects.create_user(username="bob")
    bobs = _access(bob, application, "openid")
    bobs_refresh = _refresh(bob, application)
    other = make_application(name="Other", user=signed_in)
    others = _access(signed_in, other, "openid")
    others_refresh = _refresh(signed_in, other)
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 204

    assert set(AccessToken.objects.all()) == {bobs, others}
    assert set(RefreshToken.objects.filter(revoked__isnull=True)) == {bobs_refresh, others_refresh}


@pytest.mark.django_db
def test_an_application_holding_only_a_refresh_token_is_shut_out_too(client, signed_in, application, headless):
    _refresh(signed_in, application)
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 204
    assert not RefreshToken.objects.filter(revoked__isnull=True).exists()


@pytest.mark.django_db
def test_an_application_holding_only_revoked_tokens_is_not_found(client, signed_in, application, headless):
    _refresh(signed_in, application).revoke()
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 404


@pytest.mark.django_db
def test_an_application_holding_nothing_is_not_found(client, signed_in, application, headless):
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 404


@pytest.mark.django_db
def test_a_revoked_application_can_no_longer_read_the_account(client, signed_in, provider, application, headless):
    tokens = tokens_for(client, application)
    headless.prove()

    client.delete(_detail(application.pk))

    userinfo = client.get(o("user-info"), HTTP_HOST=auth_host(), HTTP_AUTHORIZATION=f"Bearer {tokens['access_token']}")
    assert userinfo.status_code == 401
    refreshed = client.post(
        o("token"),
        {
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
            "client_id": application.client_id,
            "client_secret": application.issued_secret,
        },
        HTTP_HOST=auth_host(),
    )
    assert refreshed.status_code == 400


@pytest.mark.django_db
def test_an_application_holding_only_an_access_token_is_shut_out_too(client, signed_in, application, headless):
    _access(signed_in, application, "openid")
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 204
    assert not AccessToken.objects.exists()


@pytest.mark.django_db
def test_somebody_elses_tokens_for_it_are_nothing_to_shut_out(client, signed_in, application, headless):
    bob = User.objects.create_user(username="bob")
    _refresh(bob, application, _access(bob, application, "openid"))
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 404
    assert AccessToken.objects.count() == 1


@pytest.mark.django_db
def test_tokens_another_application_holds_are_nothing_to_shut_out_here(
    client, signed_in, application, another, headless
):
    _refresh(signed_in, another, _access(signed_in, another, "openid"))
    headless.prove()

    assert client.delete(_detail(application.pk)).status_code == 404
    assert AccessToken.objects.count() == 1
