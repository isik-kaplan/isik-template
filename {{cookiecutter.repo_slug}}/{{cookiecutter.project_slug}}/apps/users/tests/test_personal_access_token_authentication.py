from datetime import timedelta

import pytest
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.users.authentication import PersonalAccessTokenAuthentication
from apps.users.models import PersonalAccessToken, SiteSettings
from apps.users.models.user import User
from apps.users.personal_access_tokens import make_token


USERS = reverse("users-list")
MANAGE = "users:manage:user"


def permission(name):
    return Permission.objects.get(content_type=ContentType.objects.get_for_model(Permission), codename=name)


def _with(path, token):
    """The token and no session."""
    return Client().get(path, HTTP_AUTHORIZATION=f"Bearer {token}")


def _usernames(response):
    return [row["username"] for row in response.json()["results"]]


@pytest.fixture
def bob(db):
    return User.objects.create_user(username="bob")


@pytest.fixture
def manager(alice):
    alice.user_permissions.add(permission(MANAGE))
    return alice


def _token(user, scopes=(), **fields):
    return make_token(user=user, scopes=[permission(scope) for scope in scopes], name="CI", **fields).issued_token


@pytest.mark.django_db
def test_a_token_acts_with_a_permission_both_its_owner_and_it_hold(manager, bob):
    assert _usernames(_with(USERS, _token(manager, [MANAGE]))) == ["alice", "bob"]


@pytest.mark.django_db
def test_a_permission_its_owner_holds_is_not_the_tokens_unless_they_gave_it(manager, bob):
    assert _usernames(_with(USERS, _token(manager))) == ["alice"]


@pytest.mark.django_db
def test_a_permission_its_owner_no_longer_holds_is_gone_from_it_too(manager, bob):
    token = _token(manager, [MANAGE])
    manager.user_permissions.clear()

    assert _usernames(_with(USERS, token)) == ["alice"]


@pytest.mark.django_db
@pytest.mark.parametrize("rank", ["is_staff", "is_superuser"])
def test_a_rank_is_never_a_tokens_to_act_with(alice, bob, rank):
    setattr(alice, rank, True)
    alice.save()

    assert _usernames(_with(USERS, _token(alice))) == ["alice"]


@pytest.mark.django_db
@pytest.mark.parametrize("path", [reverse("users-me"), reverse("personal-access-tokens-list")])
def test_a_token_reaches_only_what_says_it_may(alice, path):
    response = _with(path, _token(alice))

    assert response.status_code == 403
    assert response.json()["detail"] == "A token cannot do this on anybody's behalf."


@pytest.mark.django_db
def test_a_token_cannot_make_another(manager):
    response = Client().post(
        reverse("personal-access-tokens-list"),
        {"name": "more"},
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {_token(manager, [MANAGE])}",
    )

    assert response.status_code == 403
    assert PersonalAccessToken.objects.count() == 1


@pytest.mark.django_db
def test_using_it_is_written_down(alice):
    token = _token(alice)

    _with(USERS, token)

    assert PersonalAccessToken.objects.get().last_used_at is not None


@pytest.mark.django_db
def test_using_it_leaves_its_history_alone(alice):
    token = _token(alice)
    history = PersonalAccessToken.pgh_event_model.objects.count()

    _with(USERS, token)

    assert PersonalAccessToken.pgh_event_model.objects.count() == history


@pytest.mark.django_db
def test_a_token_still_in_date_works(alice):
    assert _with(USERS, _token(alice, expires_at=timezone.now() + timedelta(minutes=1))).status_code == 200


REFUSED = "That token is unknown, expired or no longer allowed to sign in."


@pytest.mark.django_db
def test_an_expired_token_is_refused(alice):
    token = _token(alice, expires_at=timezone.now() + timedelta(minutes=1))
    PersonalAccessToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    response = _with(USERS, token)

    assert response.status_code == 403
    assert response.json()["detail"] == REFUSED


@pytest.mark.django_db
def test_a_deactivated_owners_token_is_refused(alice):
    token = _token(alice)
    alice.is_active = False
    alice.save()

    assert _with(USERS, token).json()["detail"] == REFUSED


@pytest.mark.django_db
def test_a_token_whose_owner_the_login_policy_shuts_out_is_refused(alice):
    token = _token(alice)
    site = SiteSettings.current()
    site.login_policy = SiteSettings.LoginPolicy.SUPERUSERS
    site.save()

    assert _with(USERS, token).json()["detail"] == REFUSED


@pytest.mark.django_db
def test_a_deleted_token_is_refused(alice):
    token = _token(alice)
    PersonalAccessToken.objects.all().delete()

    assert _with(USERS, token).json()["detail"] == REFUSED


@pytest.mark.django_db
def test_a_token_nobody_made_is_refused(alice):
    assert _with(USERS, "pat_not-one-anybody-made").json()["detail"] == REFUSED


@pytest.mark.django_db
def test_a_token_that_is_not_text_is_refused_not_crashed_on(alice):
    response = Client().get(USERS, HTTP_AUTHORIZATION=b"Bearer pat_\xff\xfe".decode("latin-1"))

    assert response.json()["detail"] == REFUSED


def _authenticate(header):
    request = Request(APIRequestFactory().get(USERS, HTTP_AUTHORIZATION=header))
    return PersonalAccessTokenAuthentication().authenticate(request)


@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Basic cGF0X3g6eQ==", "Bearer not-a-pat_", "Bearer pat_a extra", "Token pat_a", "pat_a"],
)
def test_anything_but_a_bearer_personal_access_token_is_left_to_the_others(header):
    assert _authenticate(header) is None


@pytest.mark.django_db
def test_the_scheme_is_read_whatever_its_case(alice):
    response = Client().get(USERS, HTTP_AUTHORIZATION=f"bEaReR {_token(alice)}")

    assert _usernames(response) == ["alice"]


@pytest.mark.django_db
def test_a_view_that_names_no_action_takes_no_token(alice):
    token = _token(alice)
    request = Request(
        APIRequestFactory().get(USERS, HTTP_AUTHORIZATION=f"Bearer {token}"), parser_context={"view": object()}
    )

    with pytest.raises(PermissionDenied):
        PersonalAccessTokenAuthentication().authenticate(request)
