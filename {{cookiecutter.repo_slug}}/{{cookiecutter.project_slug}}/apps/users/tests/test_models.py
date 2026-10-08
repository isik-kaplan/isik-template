import uuid

import pytest
from django.conf import settings
from django.db import IntegrityError, transaction

from apps.users.models.site_settings import SiteSettings
from apps.users.models.user import User


@pytest.mark.django_db
def test_user_has_a_uuid7_primary_key():
    user = User.objects.create_user(username="alice", email="alice@example.test", password="correct-horse-battery")
    assert isinstance(user.id, uuid.UUID)
    assert user.id.version == 7


def _refused(queryset, **values):
    """Whether the database itself refuses this write. `update()` runs no `full_clean()`, so only the
    column's own CHECK stands in the way."""
    try:
        with transaction.atomic():
            queryset.update(**values)
    except IntegrityError:
        return True
    return False


@pytest.mark.django_db
def test_the_column_refuses_a_language_the_project_does_not_ship():
    User.objects.create_user(username="alice", email="alice@example.test")

    assert _refused(User.objects.all(), language="xx")


@pytest.mark.django_db
@pytest.mark.parametrize("code", ["", *(code for code, _ in settings.LANGUAGES)])
def test_the_column_takes_every_language_the_project_ships_and_no_preference(code):
    User.objects.create_user(username="alice", email="alice@example.test")

    assert not _refused(User.objects.all(), language=code)


@pytest.mark.django_db
def test_the_column_refuses_a_login_policy_that_is_not_a_rung():
    SiteSettings.objects.create()

    assert _refused(SiteSettings.objects.all(), login_policy="nobody")


@pytest.mark.django_db
@pytest.mark.parametrize("policy", SiteSettings.LoginPolicy.values)
def test_the_column_takes_every_rung(policy):
    SiteSettings.objects.create()

    assert not _refused(SiteSettings.objects.all(), login_policy=policy)
