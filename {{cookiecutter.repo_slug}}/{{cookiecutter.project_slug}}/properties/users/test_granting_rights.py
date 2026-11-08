from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.models import Permission as PermissionRow
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils import timezone
from hypothesis import given
from hypothesis import strategies as st
from isik.django.apps.features.resolution import effective
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.api.serializers.managed_user import ManagedUserSerializer
from apps.users.api.serializers.personal_access_token import PersonalAccessTokenSerializer
from apps.users.api.serializers.user import UserSerializer
from apps.users.granting import may_grant, refuse_a_grant_beyond_the_giver, refuse_a_grant_that_can_never_apply
from apps.users.models import PersonalAccessToken
from apps.users.models.user import User
from apps.users.names import NameRequirement
from apps.users.permissions import VOCABULARY, Permission
from apps.users.personal_access_tokens import make_token


NAMES = sorted(VOCABULARY.by_name)
DELEGATABLE = sorted(str(name) for name in VOCABULARY.delegatable())
GRANT = str(Permission.USERS_GRANT_RIGHTS)
HELD = st.sets(st.sampled_from(NAMES), max_size=4)


def _grant(user, names):
    sentinel = ContentType.objects.get_for_model(PermissionRow)
    user.user_permissions.set(PermissionRow.objects.filter(content_type=sentinel, codename__in=names))


def _person(email="actor@example.test", *, is_staff=False, is_superuser=False, held=()):
    user = User.objects.create_user(email=email, is_staff=is_staff, is_superuser=is_superuser)
    _grant(user, held)
    # Fresh, so no permission cache from before the grant.
    return User.objects.get(pk=user.pk)


@pytest.mark.django_db
@pytest.mark.parametrize("rank", ["anonymous", "member", "staff", "staff granter", "superuser"])
@given(
    held=HELD,
    raising_is_staff=st.booleans(),
    raising_is_superuser=st.booleans(),
    # A name nobody declared is beyond everybody, superusers included.
    asked=st.sets(st.sampled_from([*NAMES, "nobody:holds:this"]), max_size=3),
)
def test_a_grant_goes_through_only_within_what_the_giver_holds(
    rank, held, raising_is_staff, raising_is_superuser, asked
):
    with transaction.atomic():
        if rank == "anonymous":
            actor = AnonymousUser()
        else:
            if rank == "staff granter":
                held = {*held, GRANT}
            actor = _person(is_staff=rank != "member", is_superuser=rank == "superuser", held=held)
        holds = set(NAMES) if rank == "superuser" else VOCABULARY.closure(held)
        grants = rank == "superuser" or (rank.startswith("staff") and GRANT in holds)

        assert may_grant(actor) == grants
        call = {
            "raising_is_staff": raising_is_staff,
            "raising_is_superuser": raising_is_superuser,
            "permissions": asked,
        }
        if not (raising_is_staff or raising_is_superuser or asked):
            refuse_a_grant_beyond_the_giver(actor, **call)
        elif not grants:
            with pytest.raises(PermissionDenied):
                refuse_a_grant_beyond_the_giver(actor, **call)
        elif raising_is_superuser and rank != "superuser":
            with pytest.raises(ValidationError, match="superuser"):
                refuse_a_grant_beyond_the_giver(actor, **call)
        elif asked - holds:
            with pytest.raises(ValidationError) as refused:
                refuse_a_grant_beyond_the_giver(actor, **call)
            assert all(name in str(refused.value) for name in asked - holds)
        else:
            refuse_a_grant_beyond_the_giver(actor, **call)
        transaction.set_rollback(True)


@given(recipient_is_staff=st.booleans(), permissions=st.sets(st.sampled_from(NAMES), max_size=4))
def test_granting_rights_to_somebody_who_is_not_staff_is_refused(recipient_is_staff, permissions):
    if GRANT in permissions and not recipient_is_staff:
        with pytest.raises(ValidationError):
            refuse_a_grant_that_can_never_apply(recipient_is_staff, permissions)
    else:
        refuse_a_grant_that_can_never_apply(recipient_is_staff, permissions)


@given(actor=st.sampled_from([None, AnonymousUser()]))
def test_nobody_signed_in_grants_anything(actor):
    assert may_grant(actor) is False


@pytest.mark.django_db
@pytest.mark.parametrize("target", ["somebody", "themselves", "a superuser"])
@pytest.mark.parametrize("actor_rank", ["superuser", "staff granter"])
@given(
    was=st.sets(st.sampled_from(NAMES), max_size=3),
    asked=st.one_of(st.none(), st.sets(st.sampled_from(NAMES), max_size=3)),
    is_staff=st.booleans(),
)
def test_an_account_manager_stores_exactly_the_access_they_may_give(target, actor_rank, was, asked, is_staff):
    with transaction.atomic():
        superuser = actor_rank == "superuser"
        actor = _person(is_staff=True, is_superuser=superuser, held=() if superuser else [GRANT, *was])
        if target == "themselves":
            person = actor
        else:
            person = _person("target@example.test", is_superuser=target == "a superuser", held=was)
        before = sorted(person.user_permissions.values_list("codename", flat=True))
        data = {"is_staff": is_staff, **({} if asked is None else {"permissions": sorted(asked)})}
        serializer = ManagedUserSerializer(
            person, data=data, partial=True, context={"request": SimpleNamespace(user=actor)}
        )

        added = (set(before) if asked is None else asked) - set(before)
        holds = set(NAMES) if superuser else VOCABULARY.closure([GRANT, *was])
        allowed = (target == "somebody" or (target == "a superuser" and superuser)) and not (
            GRANT in added and not is_staff
        )
        beyond = added - holds
        valid = serializer.is_valid()
        if not allowed or beyond:
            assert not valid
        else:
            assert valid, serializer.errors
            saved = serializer.save()
            stored = sorted(saved.user_permissions.values_list("codename", flat=True))
            assert stored == (before if asked is None else sorted(asked))
            assert User.objects.get(pk=person.pk).is_staff == is_staff
            assert serializer.data["permissions"] == stored
        transaction.set_rollback(True)


@pytest.mark.django_db
@pytest.mark.parametrize("existing", [0, 1, 2])
@pytest.mark.parametrize("expiry", ["left out", "past", "within", "beyond"])
@given(
    held=st.sets(st.sampled_from(DELEGATABLE), max_size=3),
    asked=st.sets(st.sampled_from(DELEGATABLE), max_size=3),
    days=st.integers(min_value=0, max_value=400),
    name=st.text(alphabet="abcdef ", min_size=1, max_size=20).filter(str.strip),
)
def test_a_token_is_made_only_within_what_its_owner_holds_and_may_keep(
    monkeypatch, existing, expiry, held, asked, days, name
):
    monkeypatch.setattr("apps.users.api.serializers.personal_access_token.TOKENS_PER_USER", 2)
    with transaction.atomic():
        owner = _person(held=held)
        for index in range(existing):
            make_token(user=owner, scopes=[], name=f"old {index}")
        lifetime = effective(owner, "token_lifetime_days").value
        data = {"name": name, "scopes": sorted(asked)}
        # A minute clear of each boundary, so the clock moving during the check can't tip it.
        offset = {
            "past": -timedelta(days=days, minutes=1),
            "within": timedelta(days=days % lifetime, minutes=1),
            "beyond": timedelta(days=lifetime + days, minutes=1),
        }
        if expiry != "left out":
            data["expires_at"] = (timezone.now() + offset[expiry]).isoformat()
        serializer = PersonalAccessTokenSerializer(data=data, context={"request": SimpleNamespace(user=owner)})

        holds = VOCABULARY.closure(held)
        fits = expiry in ("left out", "within")
        expected = asked <= holds and fits and existing < 2
        assert serializer.is_valid() == expected, serializer.errors
        if expected:
            token = serializer.save()
            assert serializer.data["token"] == token.issued_token
            assert sorted(token.scopes.values_list("codename", flat=True)) == sorted(asked)
            assert token.expires_at <= timezone.now() + timedelta(days=lifetime)
            assert PersonalAccessToken.objects.filter(user=owner).count() == existing + 1
        transaction.set_rollback(True)


NAME_VALUE = st.sampled_from(["", "Ada", "ada_l"])


@pytest.mark.django_db
@pytest.mark.parametrize("requirement", NameRequirement)
@given(
    had_username=st.booleans(),
    values=st.dictionaries(st.sampled_from(["first_name", "last_name", "username"]), NAME_VALUE),
)
def test_a_person_editing_themselves_is_refused_exactly_what_the_name_requirement_refuses(
    monkeypatch, requirement, had_username, values
):
    monkeypatch.setattr(NameRequirement, "current", classmethod(lambda cls: requirement))
    with transaction.atomic():
        person = User.objects.create_user(email="ada@example.test", username="ada" if had_username else None)
        serializer = UserSerializer(
            person, data=values, partial=True, context={"request": SimpleNamespace(user=person)}
        )

        # A handle already chosen is read-only, so whatever is sent for it is ignored.
        given_values = {k: v for k, v in values.items() if not (k == "username" and had_username)}
        refused = NameRequirement.current().refusals(given_values)
        valid = serializer.is_valid()
        if refused:
            assert not valid
            assert set(refused) <= set(serializer.errors)
        else:
            assert valid, serializer.errors
            serializer.save()
            person.refresh_from_db()
            assert person.username == ("ada" if had_username else (values.get("username") or None))
        transaction.set_rollback(True)
