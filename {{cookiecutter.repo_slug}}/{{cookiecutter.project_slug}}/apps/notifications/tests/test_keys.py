"""Each key builder makes the field its tables were migrated with. The models' own fields were built at import,
so only a fresh call can show what the builder makes now."""

from django.db.migrations.loader import MigrationLoader
from django.db.models import Func

from apps.common.models.base import primary_key
from apps.notifications.keys import kind_key, user_key


def migrated(model, field):
    state = MigrationLoader(None, ignore_no_migrations=True).project_state()
    path, args, kwargs = state.apps.get_model(model)._meta.get_field(field).deconstruct()[1:]
    # Django sets it on whichever field becomes a model's primary key; no builder does.
    kwargs.pop("serialize", None)
    return path, args, kwargs


def built(field):
    return field.deconstruct()[1:]


def test_a_primary_key_is_the_one_migrated():
    assert built(primary_key()) == migrated("users.User", "id")
    assert built(primary_key(db_default=Func(function="uuidv7"))) == migrated("notifications.Notice", "id")


def test_a_user_key_is_the_one_migrated():
    assert built(user_key("whose inbox it's in")) == migrated("notifications.InboxItem", "user")
    assert built(user_key("whose choice this is")) == migrated("notifications.Subscription", "user")


def test_a_kind_key_is_the_one_migrated():
    assert built(kind_key()) == migrated("notifications.InboxItem", "kind")
