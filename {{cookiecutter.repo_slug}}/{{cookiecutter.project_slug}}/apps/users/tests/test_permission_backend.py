"""How a permission is read: the bare name and the closure.

Two backends are configured and only one answers these questions. That split is the subject as much as the
answers are - Django unions `get_all_permissions` across backends, so a second contributor would hand every
user `auth.<name>` beside the bare name and nothing would notice.
"""

import pytest
from django.contrib.auth.models import AnonymousUser, Group
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType

from apps.users.backends import AuthenticationBackend, PermissionsBackend
from apps.users.models.user import User
from apps.users.permissions import Declaration, Permission, Vocabulary


MANAGE = Permission.USERS_MANAGE_USER


def _row(codename):
    return PermissionRow.objects.get_or_create(
        codename=codename,
        content_type=ContentType.objects.get_for_model(PermissionRow),
        defaults={"name": codename},
    )[0]


@pytest.fixture
def user(db):
    return User.objects.create_user(username="perm-user", email="perm-user@example.test")


def _fresh(user):
    """The permission caches live on the object, so a question after a grant asks a new one."""
    return User.objects.get(pk=user.pk)


def _where_write_requires_read(monkeypatch):
    read = Declaration("people:read:all", label="Read", delegatable=True)
    write = Declaration("people:write:all", label="Write", delegatable=True, requires=(read,))
    monkeypatch.setattr("apps.users.backends.permissions.VOCABULARY", Vocabulary([read, write]))


@pytest.mark.django_db
def test_a_granted_permission_is_checked_by_its_bare_name(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)

    assert user.has_perm(MANAGE)
    assert not user.has_perm(f"auth.{MANAGE}")


@pytest.mark.django_db
def test_a_group_grant_counts_too(user):
    group = Group.objects.create(name="Managers")
    group.permissions.add(_row(MANAGE))
    user.groups.add(group)

    assert _fresh(user).has_perm(MANAGE)


@pytest.mark.django_db
def test_holding_nothing_grants_nothing(user):
    assert not user.has_perm(MANAGE)
    assert PermissionsBackend().get_all_permissions(user) == set()


@pytest.mark.django_db
def test_has_module_perms_answers_about_the_first_segment(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)

    assert user.has_module_perms("users")
    assert not user.has_module_perms("people")


@pytest.mark.django_db
def test_a_grant_is_recorded_unexpanded_and_expanded_when_checked(user, monkeypatch):
    """`get_user_permissions` answers "what was granted"; only `get_all_permissions` answers "what can they
    do". Keeping them apart is what lets the graph change with no data migration."""
    _where_write_requires_read(monkeypatch)
    user.user_permissions.add(_row("people:write:all"))
    backend = PermissionsBackend()

    assert backend.get_user_permissions(user) == {"people:write:all"}
    assert backend.get_all_permissions(user) == {"people:write:all", "people:read:all"}


@pytest.mark.django_db
def test_a_superuser_holds_every_permission():
    """`has_perm` never reaches a backend for a superuser in a session, so this pins what
    `get_all_permissions` reports rather than what a gate decides."""
    superuser = User.objects.create_superuser(username="boss", email="boss@example.test", password="x")

    assert MANAGE in PermissionsBackend().get_all_permissions(superuser)


@pytest.mark.django_db
def test_an_inactive_user_holds_nothing_and_the_refusal_is_not_remembered(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    user.is_active = False
    backend = PermissionsBackend()

    assert backend.get_all_permissions(user) == set()
    assert backend.get_user_permissions(user) == set()
    assert backend.get_group_permissions(user) == set()
    assert not backend.has_module_perms(user, "users")

    user.is_active = True

    assert backend.get_all_permissions(user) == {MANAGE}


@pytest.mark.django_db
def test_what_was_granted_is_read_once_per_user_object(user):
    """One request asks repeatedly - a gate per view - so it is answered from the cache."""
    backend = PermissionsBackend()
    assert backend.get_user_permissions(user) == set()
    assert backend.get_all_permissions(user) == set()

    user.user_permissions.add(_row(MANAGE))

    assert backend.get_user_permissions(user) == set()
    assert backend.get_all_permissions(user) == set()


@pytest.mark.django_db
def test_a_token_narrows_what_its_person_holds_and_cannot_widen_it(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    user.token_scopes = {"people:read:all"}

    assert PermissionsBackend().get_all_permissions(user) == set()


@pytest.mark.django_db
def test_a_token_may_ask_for_a_permission_the_grant_only_implies(user, monkeypatch):
    """Both sides are expanded before they meet: an application asking only for the read the granted write
    implies would otherwise hold nothing at all."""
    _where_write_requires_read(monkeypatch)
    user.user_permissions.add(_row("people:write:all"))
    user.token_scopes = {"people:read:all"}

    assert PermissionsBackend().get_all_permissions(user) == {"people:read:all"}


@pytest.mark.django_db
def test_a_token_asking_for_what_nothing_granted_still_holds_nothing(user, monkeypatch):
    _where_write_requires_read(monkeypatch)
    user.user_permissions.add(_row("people:read:all"))
    user.token_scopes = {"people:write:all"}

    assert PermissionsBackend().get_all_permissions(user) == {"people:read:all"}


@pytest.mark.django_db
def test_an_anonymous_visitor_and_an_object_level_question_hold_nothing(user):
    """Object-level permissions are out of scope, and "yes, generally" about one row would be worse than no
    answer."""
    user.user_permissions.add(_row(MANAGE))
    backend = PermissionsBackend()

    assert backend.get_all_permissions(AnonymousUser()) == set()
    assert backend.get_all_permissions(user, obj=user) == set()
    assert backend.get_user_permissions(user, obj=user) == set()


@pytest.mark.django_db
def test_the_authentication_backend_contributes_no_permissions(user):
    user.user_permissions.add(_row(MANAGE))
    backend = AuthenticationBackend()

    assert backend.get_user_permissions(user) == set()
    assert backend.get_group_permissions(user) == set()
    assert backend.get_all_permissions(user) == set()
    assert not backend.has_perm(user, MANAGE)
    assert not backend.has_module_perms(user, "users")


@pytest.mark.django_db
def test_the_permissions_backend_authenticates_nobody(user):
    assert PermissionsBackend().authenticate(request=None, username=user.username, password="x") is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("staff", "granted", "token", "sees"),
    [
        (False, False, None, False),
        (True, False, None, True),
        (False, True, None, True),
        (True, False, set(), False),
        (False, True, {MANAGE}, True),
    ],
)
def test_who_sees_every_account(user, staff, granted, token, sees):
    """Staff by rank in a session; through an application, only by the permission it was let have."""
    user.is_staff = staff
    user.save()
    if granted:
        user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    if token is not None:
        user.token_scopes = token

    assert user.may_see_every_account is sees


@pytest.mark.django_db
def test_a_superuser_acting_through_a_token_holds_only_what_it_was_let_have():
    superuser = User.objects.create_superuser(username="boss", email="boss@example.test", password="x")
    superuser.token_scopes = set()

    assert not superuser.has_perm(MANAGE)
    assert not superuser.has_module_perms("users")


@pytest.mark.django_db
def test_an_inactive_person_acting_through_a_token_holds_nothing(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    user.is_active = False
    user.token_scopes = {MANAGE}

    assert not user.has_perm(MANAGE)
    assert not user.has_module_perms("users")


@pytest.mark.django_db
def test_a_token_holding_a_permission_counts_toward_its_app(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    user.token_scopes = {MANAGE}

    assert user.has_perm(MANAGE)
    assert user.has_module_perms("users")


@pytest.mark.django_db
@pytest.mark.parametrize("token", [None, {MANAGE}])
def test_nothing_is_held_about_one_object_in_particular(user, token):
    """Permissions here are global; asked about an object, the answer is no - in a session or a token."""
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    if token is not None:
        user.token_scopes = token

    assert not user.has_perm(MANAGE, obj=user)


@pytest.mark.django_db
def test_what_somebody_holds_is_read_once_per_object(user):
    user.user_permissions.add(_row(MANAGE))
    user = _fresh(user)
    assert user.has_perm(MANAGE)

    user.user_permissions.clear()

    assert user.has_perm(MANAGE)
    assert not _fresh(user).has_perm(MANAGE)
