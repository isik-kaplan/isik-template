from datetime import timedelta
from types import SimpleNamespace

import pytest
from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.features.operations import set_setting
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.users.authentication import PersonalAccessTokenAuthentication
from apps.users.backends import AuthenticationBackend, PermissionsBackend
from apps.users.models import PersonalAccessToken
from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User
from apps.users.permissions import VOCABULARY
from apps.users.personal_access_tokens import PREFIX, make_token
from apps.users.second_factor import KeepingDeleteWebAuthnInput
from apps.users.social_login import social_login_provider_ids


NAMES = sorted(VOCABULARY.by_name)
SOME = st.sets(st.sampled_from(NAMES), max_size=4)
Policy = SiteSettings.LoginPolicy


def _person(*, held=(), **fields):
    user = User.objects.create_user(email="owner@example.test", **fields)
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    user.user_permissions.set(PermissionRow.objects.filter(content_type=sentinel, codename__in=held))
    return user


def _request(header, view):
    django_request = APIRequestFactory().get("/", **({"HTTP_AUTHORIZATION": header} if header is not None else {}))
    return Request(django_request, parser_context={"view": view})


TAKES_TOKENS = SimpleNamespace(action="list", token_actions=frozenset({"list"}))


def _names_a_personal_token(header):
    parts = header.split() if header else []
    return len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].startswith(PREFIX)


# What a WSGI server hands over is Latin-1.
HEADERS = st.one_of(
    st.none(), st.text(st.characters(max_codepoint=255), max_size=20), st.sampled_from(["Bearer", "Basic pat_x"])
)


@given(header=HEADERS.filter(lambda header: not _names_a_personal_token(header)))
def test_a_header_that_is_no_personal_token_is_left_to_the_next_authenticator(header):
    assert PersonalAccessTokenAuthentication().authenticate(_request(header, TAKES_TOKENS)) is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "refusal", ["unknown", "expired", "inactive owner", "shut out by the ladder", "an action tokens can't take"]
)
@given(scopes=SOME)
def test_a_token_is_refused_for_every_reason_alike(refusal, scopes):
    with transaction.atomic():
        owner = _person(held=scopes, is_active=refusal != "inactive owner")
        expires = timezone.now() - timedelta(minutes=1) if refusal == "expired" else None
        scope_rows = PermissionRow.objects.filter(codename__in=scopes)
        token = make_token(user=owner, scopes=scope_rows, name="ci", expires_at=expires)
        if refusal == "shut out by the ladder":
            SiteSettings.objects.create(login_policy=Policy.STAFF)
        presented = f"{PREFIX}not-it" if refusal == "unknown" else token.issued_token
        view = SimpleNamespace(action="me", token_actions=frozenset({"list"}))
        request = _request(f"Bearer {presented}", view if refusal.startswith("an action") else TAKES_TOKENS)

        expected = PermissionDenied if refusal.startswith("an action") else AuthenticationFailed
        with pytest.raises(expected):
            PersonalAccessTokenAuthentication().authenticate(request)
        assert PersonalAccessToken.objects.get(pk=token.pk).last_used_at is None
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("is_superuser", [False, True])
@given(held=SOME, scopes=SOME, module=st.sampled_from(["users", "oauth", "nothing"]))
def test_a_token_holds_what_both_it_and_its_owner_hold(is_superuser, held, scopes, module):
    with transaction.atomic():
        owner = _person(held=held, is_superuser=is_superuser)
        token = make_token(user=owner, scopes=PermissionRow.objects.filter(codename__in=scopes), name="ci")

        user, used = PersonalAccessTokenAuthentication().authenticate(
            _request(f"Bearer {token.issued_token}", TAKES_TOKENS)
        )

        assert used.pk == token.pk
        assert user.token_scopes == set(scopes)
        owns = set(NAMES) if is_superuser else VOCABULARY.closure(held)
        holds = owns & VOCABULARY.closure(scopes)
        assert {name for name in NAMES if user.has_perm(name)} == holds
        assert user.has_module_perms(module) == any(name.split(":")[0] == module for name in holds)
        assert PersonalAccessToken.objects.get(pk=token.pk).last_used_at is not None
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("who", ["inactive", "anonymous", "about an object"])
@given(held=SOME)
def test_nobody_inactive_or_anonymous_holds_anything_nor_does_anybody_over_an_object(who, held):
    with transaction.atomic():
        person = AnonymousUser() if who == "anonymous" else _person(held=held, is_active=who != "inactive")
        obj = object() if who == "about an object" else None
        backend = PermissionsBackend()

        assert backend.get_user_permissions(person, obj) == set()
        assert backend.get_all_permissions(person, obj) == set()
        assert not any(backend.has_perm(person, name, obj) for name in NAMES)
        if who != "about an object":
            assert not backend.has_module_perms(person, "users")
        transaction.set_rollback(True)


@pytest.mark.django_db
@given(held=SOME, is_superuser=st.booleans())
def test_the_authentication_backend_never_answers_for_permissions(held, is_superuser):
    with transaction.atomic():
        person = _person(held=held, is_superuser=is_superuser)
        backend = AuthenticationBackend()

        assert backend.get_user_permissions(person) == set()
        assert backend.get_group_permissions(person) == set()
        assert backend.get_all_permissions(person) == set()
        assert not any(backend.has_perm(person, name) for name in NAMES)
        assert backend.has_module_perms(person, "users") is False
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("required", [False, True])
@given(totp=st.booleans(), recovery_codes=st.booleans(), passkeys=st.integers(min_value=0, max_value=3), data=st.data())
def test_the_last_second_factor_stays_while_two_factor_is_required(required, totp, recovery_codes, passkeys, data):
    with transaction.atomic():
        person = _person()
        if required:
            set_setting(person, "two_factor_required", True)
        # One TOTP and one set of codes at most; passkeys as many as anybody likes.
        kinds = [Authenticator.Type.TOTP] * totp + [Authenticator.Type.RECOVERY_CODES] * recovery_codes
        kinds += [Authenticator.Type.WEBAUTHN] * passkeys
        made = [Authenticator.objects.create(user=person, type=kind, data={}) for kind in kinds]
        removing = data.draw(st.lists(st.sampled_from(made), unique=True)) if made else []
        factors = [each for each in made if each.type in (Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN)]
        keeps = not required or any(each not in removing for each in factors)

        passkeys = [each for each in removing if each.type == Authenticator.Type.WEBAUTHN]
        if passkeys and len(passkeys) == len(removing):
            form = KeepingDeleteWebAuthnInput({"authenticators": [each.pk for each in passkeys]}, user=person)
            assert form.is_valid() == keeps
        if len(removing) == 1:
            assert get_adapter().can_delete_authenticator(removing[0]) == keeps
        # Every passkey at once, which a drawn removal is only now and then.
        everything = [each for each in made if each.type == Authenticator.Type.WEBAUTHN]
        if everything:
            form = KeepingDeleteWebAuthnInput({"authenticators": [each.pk for each in everything]}, user=person)
            assert form.is_valid() == (not required or totp)
        transaction.set_rollback(True)


SHIPPED = ["github", "google", "gitlab", "openid_connect:corp", "openid_connect:customers"]
UNNAMED = ["openid_connect", "openid_connect:Corp", "github:corp"]


# Its own property, so every run reaches the refusal: the list below seldom draws one beside no unknown.
@given(named=st.lists(st.sampled_from(SHIPPED), unique=True, max_size=3), unnamed=st.sampled_from(UNNAMED))
def test_an_issuer_left_unnamed_is_refused_wherever_it_is_listed(named, unnamed):
    with pytest.raises(ImproperlyConfigured, match="issuer"):
        social_login_provider_ids([*named, unnamed])


# A shipped provider named twice drawn on its own: a random list seldom repeats one without an unknown beside it.
@given(
    requested=st.lists(
        st.sampled_from([*SHIPPED, *UNNAMED, "nope", "base", " ", ""]).map(lambda s: f" {s} "), max_size=5
    )
    | st.sampled_from(SHIPPED).map(lambda provider: [f" {provider} ", provider])
)
def test_a_provider_list_is_kept_in_order_unless_it_names_one_unknown_unnamed_or_twice(requested):
    ids = [each.strip() for each in requested if each.strip()]
    unknown = {each for each in ids if each.partition(":")[0] not in {entry.partition(":")[0] for entry in SHIPPED}}
    if unknown:
        with pytest.raises(ImproperlyConfigured, match="unknown"):
            social_login_provider_ids(requested)
    elif set(ids) & set(UNNAMED):
        with pytest.raises(ImproperlyConfigured, match="issuer"):
            social_login_provider_ids(requested)
    elif len(set(ids)) < len(ids):
        with pytest.raises(ImproperlyConfigured, match="more than once"):
            social_login_provider_ids(requested)
    else:
        assert social_login_provider_ids(requested) == ids
