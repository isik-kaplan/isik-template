"""The provider's REST API, driven past the reauthentication gate and the version check: what an owner may
register and do to an application, what a superuser may approve, what a person may shut out, and what a
device code shown on a screen may be answered with."""

import time
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from oauth2_provider.models import get_access_token_model, get_device_grant_model, get_refresh_token_model
from rest_framework.exceptions import ValidationError

from apps.common.links import api_path
from apps.oauth_provider.api.viewsets.application import ApplicationViewSet
from apps.oauth_provider.api.viewsets.reviewed_application import ReviewedApplicationViewSet
from apps.oauth_provider.device_codes import ALPHABET, LENGTH
from apps.oauth_provider.models import Application
from apps.oauth_provider.services import deciding
from apps.oauth_provider.tests import conftest as oauth
from apps.oauth_provider.tests.conftest import make_application, permission, set_approval
from apps.users.models.user import User
from conftest import give_authentication_records, versioned


alice = oauth.alice
provider = oauth.provider

pytestmark = pytest.mark.django_db

AccessToken = get_access_token_model()
RefreshToken = get_refresh_token_model()
DeviceGrant = get_device_grant_model()

DEVICE_GRANT = Application.GRANT_DEVICE_CODE
APPROVALS = ["pending", "approved", "withdrawn", "disabled"]
DELEGATABLE = ["users:grant:rights", "users:manage:user"]
NAMES = st.text(st.characters(codec="ascii", categories=["L", "N"]), min_size=1, max_size=20)
HOSTS = st.text(st.sampled_from("abcdefghijklmnopqrstuvwxyz"), min_size=1, max_size=8)
URIS = st.lists(HOSTS.map(lambda host: f"https://{host}.example.test/callback"), min_size=1, max_size=3, unique=True)


def _prove(client, user):
    """Signed in and just proved, which every act below spends."""
    cache.clear()
    client.force_login(user)
    session = client.session
    give_authentication_records(
        session, user, [{"method": "socialaccount", "at": time.time(), "reauthenticated": True}]
    )
    session.save()


def _owned(name):
    return api_path(f"oauth_provider:applications-{name}")


@pytest.mark.parametrize(
    "case",
    ["redirect", "redirect-without-uris", "device", "device-with-uris", "device-confidential", "over-the-limit"],
)
@given(name=NAMES, uris=URIS, client_type=st.sampled_from(["confidential", "public"]), data=st.data())
def test_an_application_is_registered_only_if_its_grant_fits_and_its_owner_has_room(
    client, provider, alice, case, name, uris, client_type, data
):
    with transaction.atomic():
        _prove(client, alice)
        delegatable = [row["name"] for row in client.get(_owned("delegatable-scopes")).json()]
        assert sorted(delegatable) == DELEGATABLE
        scopes = data.draw(st.sets(st.sampled_from(delegatable)))
        body = {"name": name, "requested_scopes": sorted(scopes), "client_type": client_type}
        if case.startswith("device"):
            body |= {"authorization_grant_type": DEVICE_GRANT, "client_type": "public"}
        if case in ("redirect", "device-with-uris", "over-the-limit"):
            body["redirect_uris"] = uris
        if case == "device-confidential":
            body["client_type"] = "confidential"
        if case == "over-the-limit":
            limit = data.draw(st.integers(min_value=0, max_value=2))
            provider.OAUTH_PROVIDER_APPLICATIONS_PER_USER = limit
            for n in range(limit):
                make_application(name=f"Earlier {n}", user=alice)

        response = client.post(_owned("list"), body, content_type="application/json")

        refused_on = {
            "redirect-without-uris": "redirect_uris",
            "device-with-uris": "redirect_uris",
            "device-confidential": "client_type",
            "over-the-limit": "non_field_errors",
        }.get(case)
        if refused_on:
            assert response.status_code == 400, response.content
            assert refused_on in response.content.decode()
        else:
            assert response.status_code == 201, response.content
            made = response.json()
            assert (made["name"], made["requested_scopes"]) == (name, sorted(scopes))
            assert (made["client_secret"] is not None) == (body["client_type"] == "confidential")
            assert made["redirect_uris"] == body.get("redirect_uris", [])
        transaction.set_rollback(True)


def _detail(application, action=None):
    if action:
        return api_path(f"oauth_provider:applications-{action}", application.pk)
    return api_path("oauth_provider:applications-detail", application.pk)


def _act(client, application, action, revoke):
    if action == "destroy":
        return client.delete(_detail(application), headers=versioned(application))
    if action == "rotate-secret":
        return client.post(_detail(application, action), {"revoke_tokens": revoke}, content_type="application/json")
    return client.post(_detail(application, action))


def _mint(application, n):
    access = AccessToken.objects.create(
        user=application.user,
        application=application,
        token=f"access-{n}",
        expires=timezone.now() + timedelta(hours=1),
    )
    RefreshToken.objects.create(
        user=application.user, application=application, token=f"refresh-{n}", access_token=access
    )


@pytest.mark.parametrize("approval", APPROVALS)
@pytest.mark.parametrize("action", ["disable", "restore", "destroy", "rotate-secret"])
@given(client_type=st.sampled_from(["confidential", "public"]), revoke=st.booleans())
def test_an_owner_moves_an_application_only_from_the_state_each_act_starts_from(
    client, provider, alice, approval, action, client_type, revoke
):
    with transaction.atomic():
        _prove(client, alice)
        application = make_application(name="Acme Notes", user=alice, client_type=client_type)
        set_approval(application, approval)

        response = _act(client, application, action, revoke)

        starts_from = {"disable": "approved", "restore": "disabled", "destroy": "disabled"}.get(action)
        if action == "rotate-secret":
            allowed = client_type == "confidential"
        else:
            allowed = approval == starts_from
        assert response.status_code == ({"destroy": 204}.get(action, 200) if allowed else 400), response.content
        if allowed and action == "destroy":
            assert not Application.objects.filter(pk=application.pk).exists()
        elif allowed and action == "rotate-secret":
            assert response.json()["client_secret"]
        elif allowed:
            application.refresh_from_db()
            assert application.approval == {"disable": "disabled", "restore": "approved"}[action]
        else:
            application.refresh_from_db()
            assert application.approval == approval
        transaction.set_rollback(True)


@pytest.mark.parametrize("mode", ["approval", "auto"])
@given(first=st.sets(st.sampled_from(DELEGATABLE)), then=st.sets(st.sampled_from(DELEGATABLE)))
def test_an_owner_changes_what_an_approved_application_asks_for_and_approval_never_outgrows_it(
    client, provider, alice, mode, first, then
):
    with transaction.atomic():
        provider.OAUTH_PROVIDER_MODE = mode
        _prove(client, alice)
        application = make_application(name="Acme Notes", user=alice)
        with deciding():
            application.requested_scopes.set([permission(name) for name in first])
            application.approved_scopes.set([permission(name) for name in first])
        set_approval(application, "approved")

        response = client.patch(
            _detail(application),
            {"requested_scopes": sorted(then)},
            content_type="application/json",
            headers=versioned(application),
        )

        assert response.status_code == 200, response.content
        body = response.json()
        assert body["requested_scopes"] == sorted(then)
        assert set(body["approved_scopes"]) <= then
        if mode == "auto":
            assert body["approved_scopes"] == sorted(then)
        transaction.set_rollback(True)


def _reviewed(application, action):
    return api_path(f"oauth_provider:application-reviews-{action}", application.pk)


def _reviewed_detail(application):
    return api_path("oauth_provider:application-reviews-detail", application.pk)


def _under_review(requested):
    application = make_application(
        name="Bob's Planner", user=User.objects.create_user(username="bob", email="bob@example.test")
    )
    with deciding():
        application.requested_scopes.set([permission(requested)])
    return application


@pytest.mark.parametrize("approval", APPROVALS)
@pytest.mark.parametrize("asked", ["within", "beyond"])
@given(requested=st.sampled_from(DELEGATABLE), granted=st.booleans())
def test_a_superuser_approves_only_what_was_asked_for_and_never_what_its_owner_switched_off(
    client, provider, alice, approval, asked, requested, granted
):
    with transaction.atomic():
        User.objects.filter(pk=alice.pk).update(is_superuser=True)
        alice.refresh_from_db()
        _prove(client, alice)
        application = _under_review(requested)
        set_approval(application, approval)
        approved = [requested] if granted else []
        if asked == "beyond":
            approved = sorted({*approved, *(set(DELEGATABLE) - {requested})})

        response = client.post(
            _reviewed(application, "approve"),
            {"approved_scopes": approved},
            content_type="application/json",
            headers=versioned(application),
        )

        application.refresh_from_db()
        if approval == "disabled" or asked == "beyond":
            assert response.status_code == 400, response.content
            assert ("switched_off_by_owner" if approval == "disabled" else "approved_scopes") in (
                response.content.decode()
            )
            assert application.approval == approval
        else:
            assert response.status_code == 200, response.content
            assert application.approval == "approved"
            assert sorted(str(scope) for scope in response.json()["approved_scopes"]) == approved
        transaction.set_rollback(True)


@given(name=NAMES, uris=URIS)
def test_nobody_registers_an_application_through_the_review_queue(client, provider, alice, name, uris):
    with transaction.atomic():
        User.objects.filter(pk=alice.pk).update(is_superuser=True)
        alice.refresh_from_db()
        _prove(client, alice)

        response = client.post(
            api_path("oauth_provider:application-reviews-list"),
            {"name": name, "redirect_uris": uris},
            content_type="application/json",
        )

        assert response.status_code == 405, response.content
        assert not Application.objects.filter(name=name).exists()
        transaction.set_rollback(True)


@pytest.mark.parametrize("approval", APPROVALS)
@given(requested=st.sampled_from(DELEGATABLE), tokens=st.integers(min_value=0, max_value=3))
def test_a_superuser_withdraws_anything_not_already_withdrawn_and_every_token_goes(
    client, provider, alice, approval, requested, tokens
):
    with transaction.atomic():
        User.objects.filter(pk=alice.pk).update(is_superuser=True)
        alice.refresh_from_db()
        _prove(client, alice)
        application = _under_review(requested)
        set_approval(application, approval)
        for n in range(tokens):
            _mint(application, n)

        response = client.post(_reviewed(application, "withdraw"))

        application.refresh_from_db()
        if approval == "withdrawn":
            assert response.status_code == 400, response.content
        else:
            assert response.status_code == 200, response.content
            assert application.approval == "withdrawn"
            assert not AccessToken.objects.filter(application=application).exists()
            assert not RefreshToken.objects.filter(application=application, revoked__isnull=True).exists()
        transaction.set_rollback(True)


@pytest.mark.parametrize("approval", APPROVALS)
# Refused early, before any proof is asked for, or (should the state move in between) by the delete itself.
@pytest.mark.parametrize("asked_early", [True, False])
@given(requested=st.sampled_from(DELEGATABLE), tokens=st.integers(min_value=0, max_value=3))
def test_a_superuser_deletes_only_one_signing_nobody_in_and_its_tokens_go_with_it(
    client, provider, alice, monkeypatch, approval, asked_early, requested, tokens
):
    with transaction.atomic():
        User.objects.filter(pk=alice.pk).update(is_superuser=True)
        alice.refresh_from_db()
        _prove(client, alice)
        application = _under_review(requested)
        set_approval(application, approval)
        for n in range(tokens):
            _mint(application, n)

        with monkeypatch.context() as patched:
            if not asked_early:
                patched.setattr(ReviewedApplicationViewSet, "refuse_before_proving", lambda self, request: None)
            response = client.delete(_reviewed_detail(application), headers=versioned(application))

        if approval in ("withdrawn", "disabled"):
            assert response.status_code == 204, response.content
            assert not Application.objects.filter(pk=application.pk).exists()
            assert not AccessToken.objects.filter(application_id=application.pk).exists()
        else:
            assert (response.status_code, response.json()["code"]) == (400, "withdraw_first")
            assert Application.objects.filter(pk=application.pk).exists()
        transaction.set_rollback(True)


@pytest.mark.parametrize("holds", ["nothing", "access", "refresh", "both"])
@given(count=st.integers(min_value=1, max_value=3))
def test_shutting_an_application_out_is_found_only_while_it_holds_a_token_and_leaves_none(
    client, provider, alice, holds, count
):
    with transaction.atomic():
        _prove(client, alice)
        application = make_application(name="Acme Notes", user=alice)
        for n in range(count):
            access = None
            if holds in ("access", "both"):
                access = AccessToken.objects.create(
                    user=alice, application=application, token=f"a-{n}", expires=timezone.now() + timedelta(hours=1)
                )
            if holds in ("refresh", "both"):
                RefreshToken.objects.create(user=alice, application=application, token=f"r-{n}", access_token=access)

        response = client.delete(api_path("oauth_provider:authorized-applications-detail", application.pk))

        assert response.status_code == (404 if holds == "nothing" else 204), response.content
        assert not AccessToken.objects.filter(user=alice, application=application).exists()
        assert not RefreshToken.objects.filter(user=alice, application=application, revoked__isnull=True).exists()
        transaction.set_rollback(True)


CODES = st.text(st.sampled_from(ALPHABET), min_size=LENGTH, max_size=LENGTH)


def _device_code(alice, case, code, scope):
    """A code waiting for an answer, unless the case is about one that cannot be answered."""
    grant_type = Application.GRANT_AUTHORIZATION_CODE if case == "for-a-redirect-client" else DEVICE_GRANT
    with deciding():
        application = make_application(
            name="Acme CLI",
            description="Your people, in a terminal.",
            user=alice,
            client_type="public",
            authorization_grant_type=grant_type,
            redirect_uris="" if grant_type == DEVICE_GRANT else oauth.REDIRECT_URI,
            approval="approved",
        )
    if case == "withdrawn":
        set_approval(application, "withdrawn")
    if case != "unknown":
        DeviceGrant.objects.create(
            device_code=f"device-{code}",
            user_code=code,
            client_id=application.client_id,
            status="denied" if case == "already-answered" else "authorization-pending",
            scope=scope,
            expires=timezone.now() + (timedelta(minutes=-1) if case == "expired" else timedelta(minutes=5)),
        )
    return application


@pytest.mark.parametrize(
    "case", ["waiting", "withdrawn", "for-a-redirect-client", "unknown", "already-answered", "expired"]
)
@pytest.mark.parametrize("action", ["retrieve", "approve", "deny"])
@given(code=CODES, scopes=st.sets(st.sampled_from(["openid", "profile", "users:manage:user"]), min_size=1))
def test_only_a_waiting_code_of_an_approved_device_is_shown_or_answered_and_all_else_looks_alike(
    client, provider, alice, case, action, code, scopes
):
    with transaction.atomic():
        cache.clear()
        client.force_login(alice)
        scope = " ".join(sorted(scopes))
        application = _device_code(alice, case, code, scope)

        typed = code.lower()
        if action == "retrieve":
            response = client.get(api_path("oauth_provider:device-authorizations-detail", typed))
        else:
            response = client.post(api_path(f"oauth_provider:device-authorizations-{action}", typed))

        if case != "waiting":
            assert response.status_code == 404, response.content
            assert response.json()["detail"].startswith("That code is wrong")
        elif action == "retrieve":
            assert response.json() == {
                "user_code": code,
                "application_name": application.name,
                "application_description": application.description,
                "scopes": sorted(scopes),
            }
        else:
            assert response.status_code == 204, response.content
            grant = DeviceGrant.objects.get(user_code=code)
            assert (grant.user, grant.status) == (alice, "authorized" if action == "approve" else "denied")
        transaction.set_rollback(True)


@pytest.mark.parametrize("approval", [state for state in APPROVALS if state != "disabled"])
@given(name=NAMES)
def test_an_application_not_yet_disabled_is_never_deleted_however_the_delete_is_reached(alice, approval, name):
    """The view's own guard, behind the early refusal: a state changed between the two still keeps the row."""
    with transaction.atomic():
        application = make_application(user=alice, name=name)
        set_approval(application, approval)
        application.refresh_from_db()
        with pytest.raises(ValidationError):
            ApplicationViewSet().perform_destroy(application)
        assert Application.objects.filter(pk=application.pk).exists()
        transaction.set_rollback(True)
