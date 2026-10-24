"""You may grant something only if you hold it yourself."""

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.granting import may_grant, refuse_a_grant_beyond_the_giver, refuse_a_grant_that_can_never_apply
from apps.users.models.user import User
from apps.users.permissions import Permission


def holding(*names, is_staff=False, is_superuser=False, username="actor"):
    person = User.objects.create_user(username=username, is_staff=is_staff, is_superuser=is_superuser)
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    person.user_permissions.add(*PermissionRow.objects.filter(content_type=sentinel, codename__in=names))
    return User.objects.get(pk=person.pk)


@pytest.mark.django_db
def test_a_superuser_may_grant_without_holding_the_permission_explicitly():
    assert may_grant(holding(is_superuser=True))


@pytest.mark.django_db
def test_staff_alone_cannot_grant():
    assert not may_grant(holding(is_staff=True))


@pytest.mark.django_db
def test_staff_holding_the_permission_may_grant():
    assert may_grant(holding(Permission.USERS_GRANT_RIGHTS, is_staff=True))


@pytest.mark.django_db
def test_the_permission_does_nothing_for_somebody_who_is_not_staff():
    assert not may_grant(holding(Permission.USERS_GRANT_RIGHTS))


def test_nobody_in_particular_may_not_grant():
    assert not may_grant(None)
    assert not may_grant(AnonymousUser())


@pytest.mark.django_db
def test_granting_nothing_is_not_a_grant():
    refuse_a_grant_beyond_the_giver(holding(), raising_is_staff=False, raising_is_superuser=False, permissions=())
    refuse_a_grant_beyond_the_giver(holding(username="nothing-asked"))


@pytest.mark.django_db
def test_somebody_who_may_not_grant_at_all_is_refused_before_anything_else():
    with pytest.raises(PermissionDenied) as refused:
        refuse_a_grant_beyond_the_giver(holding(is_staff=True), raising_is_staff=True)

    assert str(refused.value.detail) == "You cannot change what other people may do."


@pytest.mark.django_db
def test_nobody_but_a_superuser_makes_a_superuser():
    granter = holding(Permission.USERS_GRANT_RIGHTS, is_staff=True)

    with pytest.raises(ValidationError) as refused:
        refuse_a_grant_beyond_the_giver(granter, raising_is_superuser=True)

    assert refused.value.detail == {"is_superuser": "You cannot make somebody a superuser."}


@pytest.mark.django_db
def test_anybody_who_may_grant_may_make_somebody_staff():
    refuse_a_grant_beyond_the_giver(holding(is_superuser=True, username="boss"), raising_is_staff=True)
    refuse_a_grant_beyond_the_giver(
        holding(Permission.USERS_GRANT_RIGHTS, is_staff=True, username="deputy"), raising_is_staff=True
    )


@pytest.mark.django_db
def test_a_permission_the_giver_does_not_hold_cannot_be_handed_on():
    granter = holding(Permission.USERS_GRANT_RIGHTS, is_staff=True)

    with pytest.raises(ValidationError) as refused:
        refuse_a_grant_beyond_the_giver(granter, permissions=["nobody:holds:this", "everybody:wants:this"])

    assert refused.value.detail == {
        "permissions": "You do not hold these yourself: everybody:wants:this, nobody:holds:this."
    }


@pytest.mark.django_db
def test_a_permission_the_giver_holds_or_implies_may_be_handed_on():
    """`users:grant:rights` requires `users:manage:user`."""
    granter = holding(Permission.USERS_GRANT_RIGHTS, is_staff=True)

    refuse_a_grant_beyond_the_giver(granter, permissions=[Permission.USERS_MANAGE_USER, Permission.USERS_GRANT_RIGHTS])


def test_the_grant_permission_is_refused_for_somebody_it_could_never_apply_to():
    with pytest.raises(ValidationError) as refused:
        refuse_a_grant_that_can_never_apply(False, [Permission.USERS_GRANT_RIGHTS])

    assert refused.value.detail == {"permissions": "Changing what people may do takes effect for staff only."}


def test_the_same_permission_is_fine_for_staff_and_any_other_is_fine_for_anybody():
    refuse_a_grant_that_can_never_apply(True, [Permission.USERS_GRANT_RIGHTS])
    refuse_a_grant_that_can_never_apply(False, [Permission.USERS_MANAGE_USER])
