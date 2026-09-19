import uuid

import pytest

from apps.users.models.user import User


@pytest.mark.django_db
def test_user_has_a_uuid7_primary_key():
    user = User.objects.create_user(username="alice", email="alice@example.test", password="correct-horse-battery")
    assert isinstance(user.id, uuid.UUID)
    assert user.id.version == 7
