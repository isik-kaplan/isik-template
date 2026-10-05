from types import SimpleNamespace
from urllib.parse import parse_qsl, urlsplit

import pytest
from allauth.account import app_settings as account_settings
from allauth.account.internal.flows.login import AUTHENTICATION_METHODS_SESSION_KEY
from allauth.account.signals import authentication_step_completed
from allauth.socialaccount.models import SocialAccount, SocialLogin
from allauth.socialaccount.providers.github.provider import GitHubProvider
from allauth.socialaccount.providers.openid_connect.provider import OpenIDConnectProvider
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory
from hypothesis import given
from hypothesis import strategies as st

from apps.users.models.user import User
from apps.users.reauthentication import proof
from apps.users.tests.conftest import OIDC_PROVIDER_ID


NOW = 1_800_000_000.5
ASKED_AT = 1_800_000_000


@pytest.fixture
def now(monkeypatch):
    monkeypatch.setattr(proof.time, "time", lambda: NOW)
    return NOW


def _request(user, records=(), **session):
    request = RequestFactory().get("/")
    request.user = user
    request.session = SessionStore()
    request.session[AUTHENTICATION_METHODS_SESSION_KEY] = list(records)
    request.session.update(session)
    return request


def _sociallogin(user, extra_data=None, asked_at=ASKED_AT):
    account = SocialAccount(provider=OIDC_PROVIDER_ID, uid="sub-1", extra_data=extra_data or {})
    sociallogin = SocialLogin(user=user, account=account)
    sociallogin.state = {"data": {proof.PROVING_KEY: True, proof.ASKED_AT_KEY: asked_at}, "next": "/auth/prove"}
    return sociallogin


def test_a_proving_state_says_so_and_when_it_asked_in_whole_seconds(now):
    assert proof.proving_state() == {proof.PROVING_KEY: True, proof.ASKED_AT_KEY: ASKED_AT}


@pytest.mark.parametrize(
    ("state", "proving"),
    [
        ({"data": {proof.PROVING_KEY: True}}, True),
        ({"data": {proof.PROVING_KEY: False}}, False),
        ({"data": {}}, False),
        ({"data": None}, False),
        ({}, False),
        (None, False),
    ],
)
def test_only_a_round_trip_that_asked_for_a_proof_is_one(state, proving):
    assert proof.is_proving(SimpleNamespace(state=state)) is proving


def test_only_an_openid_connect_provider_can_prove_anything():
    assert proof.can_prove_with(OpenIDConnectProvider.__new__(OpenIDConnectProvider))
    assert not proof.can_prove_with(GitHubProvider.__new__(GitHubProvider))


@pytest.mark.parametrize(
    ("extra_data", "expected"),
    [
        ({"id_token": {"auth_time": 10}, "userinfo": {"auth_time": 20}}, 10),
        ({"userinfo": {"auth_time": 20.5}}, 20.5),
        ({"id_token": {"sub": "x"}, "userinfo": {"auth_time": 20}}, 20),
        ({"id_token": {"auth_time": "10"}}, None),
        ({"id_token": {"auth_time": True}}, None),
        ({"id_token": "not claims"}, None),
        ({}, None),
        (None, None),
    ],
)
def test_when_the_provider_last_challenged_comes_from_auth_time(extra_data, expected):
    sociallogin = SimpleNamespace(account=SimpleNamespace(extra_data=extra_data))

    assert proof.authenticated_at_provider(sociallogin) == expected


@pytest.mark.django_db
def test_a_fresh_assertion_of_the_signed_in_person_is_recorded_as_a_proof(alice, now, logged):
    request = _request(alice)

    assert proof.record_a_fresh_assertion(request, _sociallogin(alice, {"id_token": {"auth_time": ASKED_AT}}))
    assert [(line["event"], line["user"], line["method"]) for line in logged] == [
        ("reauthentication.proved", str(alice.pk), "socialaccount")
    ]
    assert request.session[AUTHENTICATION_METHODS_SESSION_KEY] == [
        {"method": "socialaccount", "at": NOW, "reauthenticated": True, "provider": OIDC_PROVIDER_ID, "uid": "sub-1"}
    ]
    assert proof.has_proven_who_they_are(request)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "extra_data",
    [{"id_token": {"auth_time": ASKED_AT - 1}}, {"id_token": {}}],
    ids=["challenged-before-we-asked", "no-auth-time"],
)
def test_an_assertion_that_cannot_be_held_to_a_fresh_challenge_proves_nothing(alice, now, extra_data):
    request = _request(alice)

    assert not proof.record_a_fresh_assertion(request, _sociallogin(alice, extra_data))
    assert request.session[AUTHENTICATION_METHODS_SESSION_KEY] == []


@pytest.mark.django_db
def test_somebody_elses_identity_proves_nothing(alice, now):
    mallory = User.objects.create_user(username="mallory", email="mallory@example.test")
    fresh = {"id_token": {"auth_time": ASKED_AT}}

    assert not proof.record_a_fresh_assertion(_request(alice), _sociallogin(mallory, fresh))
    assert not proof.record_a_fresh_assertion(_request(alice), _sociallogin(User(username="new"), fresh))
    assert not proof.record_a_fresh_assertion(_request(AnonymousUser()), _sociallogin(alice, fresh))


@pytest.mark.parametrize(("proved", "query"), [(True, {"proved": "1"}), (False, {"error": "reauthentication_failed"})])
def test_a_proving_round_trip_lands_back_where_it_started_saying_how_it_went(proved, query):
    sociallogin = SimpleNamespace(state={"next": "http://example.test/auth/prove?next=%2Fprofile"})

    url = urlsplit(proof.proof_outcome_url(sociallogin, proved))

    assert url.path == "/auth/prove"
    assert dict(parse_qsl(url.query)) == {"next": "/profile", **query}


# Anything a URL can carry once encoded - surrogates are the one thing UTF-8 cannot.
_TEXT = st.text(st.characters(exclude_categories=("Cs",)))


@given(
    path=st.sampled_from(["/", "/auth/prove", "http://example.test/a/b"]),
    existing=st.dictionaries(_TEXT.filter(bool), _TEXT, max_size=3),
    added=st.dictionaries(_TEXT.filter(bool), _TEXT, min_size=1, max_size=3),
)
def test_with_query_keeps_what_the_url_had_and_adds_the_rest(path, existing, added):
    url = proof.with_query(path, existing)

    result = urlsplit(proof.with_query(url, added))

    assert result.path == urlsplit(path).path
    assert parse_qsl(result.query, keep_blank_values=True) == [*existing.items(), *added.items()]


@pytest.mark.parametrize(
    ("record", "challenge"),
    [
        ({"method": "password"}, True),
        ({"method": "mfa"}, True),
        ({"method": "socialaccount", "reauthenticated": True}, True),
        ({"method": "socialaccount"}, False),
        ({"method": "code"}, False),
        ({"method": "password_reset"}, False),
    ],
)
def test_only_something_typed_or_a_provider_proof_is_a_challenge(record, challenge):
    assert proof.is_a_challenge(record) is challenge


def _record(age, method="password"):
    return {"method": method, "at": NOW - age}


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("records", "session", "proven"),
    [
        ([_record(0)], {}, True),
        ([_record(account_settings.REAUTHENTICATION_TIMEOUT - 1)], {}, True),
        ([_record(account_settings.REAUTHENTICATION_TIMEOUT)], {}, False),
        ([_record(0, "socialaccount")], {}, False),
        ([], {}, False),
        ([_record(10)], {proof.SPENT_AT_SESSION_KEY: NOW - 10}, False),
        ([_record(10)], {proof.SPENT_AT_SESSION_KEY: NOW - 11}, True),
        ([_record(0, "socialaccount"), _record(5)], {}, True),
    ],
    ids=[
        "just-now",
        "inside-the-timeout",
        "at-the-timeout",
        "a-social-login",
        "nothing",
        "spent",
        "after-the-last-spend",
        "any-record-will-do",
    ],
)
def test_a_proof_is_an_unspent_challenge_younger_than_the_timeout(alice, now, records, session, proven):
    assert proof.has_proven_who_they_are(_request(alice, records, **session)) is proven


def test_nobody_signed_in_has_proven_anything():
    assert not proof.has_proven_who_they_are(_request(AnonymousUser(), [_record(0)]))
    assert not proof.has_proven_who_they_are(SimpleNamespace())


@pytest.mark.django_db
def test_spending_the_proof_makes_every_earlier_record_stop_counting(alice, now, logged):
    request = _request(alice, [_record(0)])

    proof.spend_the_proof(request)

    assert request.session[proof.SPENT_AT_SESSION_KEY] == NOW
    assert not proof.has_proven_who_they_are(request)
    assert [(line["event"], line["user"]) for line in logged] == [("reauthentication.spent", str(alice.pk))]


@pytest.mark.django_db
def test_somebody_with_a_password_proves_with_it(alice, providers):
    assert proof.ways_to_prove(_request(alice)) == [{"id": "reauthenticate"}]


@pytest.mark.django_db
def test_somebody_with_no_password_proves_at_their_provider_or_sets_one_by_email(alice, providers):
    alice.set_unusable_password()
    alice.save()
    SocialAccount.objects.create(user=alice, provider=OIDC_PROVIDER_ID, uid="sub-1")
    # A provider that cannot be held to a fresh challenge is never offered.
    SocialAccount.objects.create(user=alice, provider=GitHubProvider.id, uid="2")

    assert proof.ways_to_prove(_request(alice)) == [
        {"id": proof.PROVIDER_FLOW, "providers": [{"id": OIDC_PROVIDER_ID, "name": "Test IdP"}]},
        {"id": proof.SET_PASSWORD_BY_EMAIL_FLOW, "email": "alice@example.test"},
    ]


@pytest.mark.django_db
def test_nobody_is_offered_a_mail_they_have_no_address_for(alice, providers):
    alice.set_unusable_password()
    alice.email = ""
    alice.save()

    assert proof.ways_to_prove(_request(alice)) == []


@pytest.mark.django_db
def test_a_provider_proof_tells_allauth_whose_challenge_it_was(alice, now):
    seen = []

    def receiver(sender, user, method, **kwargs):
        seen.append((sender, user, method))

    authentication_step_completed.connect(receiver)
    try:
        proof.record_a_fresh_assertion(_request(alice), _sociallogin(alice, {"id_token": {"auth_time": ASKED_AT}}))
    finally:
        authentication_step_completed.disconnect(receiver)

    assert seen == [(User, alice, "socialaccount")]
