"""EncryptedField, and the trigger that keeps its column enciphered for every writer."""

import pgtrigger
import pytest
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.core.exceptions import ImproperlyConfigured
from django.db import ProgrammingError, connection, models, transaction
from django.test.utils import isolate_apps

from apps.common.db import model_db_column, model_db_name
from apps.common.fields import EncryptedField
from apps.common.sql import refuse_plaintext
from apps.common.triggers import BuiltTrigger


@pytest.fixture
def credential_key(settings):
    settings.CREDENTIAL_KEY = Fernet.generate_key().decode()
    return settings.CREDENTIAL_KEY


def test_the_refusal_to_store_a_credential_names_the_setting_that_is_missing(settings):
    """Asserted whole: the message is the only thing saying what to configure, and the field refuses
    rather than falling back to plaintext."""
    settings.CREDENTIAL_KEY = ""

    with pytest.raises(ImproperlyConfigured) as raised:
        EncryptedField().get_prep_value("a secret")

    assert str(raised.value) == "CREDENTIAL_KEY is unset, so there is nothing to encipher a stored secret with."


def test_a_field_told_to_accept_plaintext_stores_the_value_as_it_stands(settings):
    settings.CREDENTIAL_KEY = ""

    assert EncryptedField(plaintext_without_a_key=True).get_prep_value("a link") == "a link"


def test_a_field_told_to_accept_plaintext_still_enciphers_once_there_is_a_key(credential_key):
    stored = EncryptedField(plaintext_without_a_key=True).get_prep_value("a link")

    assert stored.startswith(EncryptedField.PREFIX)
    assert Fernet(credential_key.encode()).decrypt(stored.removeprefix(EncryptedField.PREFIX).encode()) == b"a link"


@pytest.mark.parametrize("stored", ["written before this field existed", None, ""])
def test_a_column_value_without_the_prefix_is_read_back_as_it_stands(stored):
    """NULL has no prefix to look for, and one unenciphered row must not take a page down."""
    assert EncryptedField().from_db_value(stored, None, None) == stored


def test_an_enciphered_column_keeps_the_options_it_was_declared_with():
    field = EncryptedField("The password it sends under", null=True, blank=True)

    assert field.verbose_name == "The password it sends under"
    assert (field.null, field.blank) == (True, True)
    assert field.plaintext_without_a_key is False


def test_a_secret_that_merely_looks_enciphered_is_enciphered_all_the_same(credential_key):
    """The prefix is a marker this field writes, not a claim a caller gets to make: skipping a value
    carrying it would store `fernet:hunter2` in the clear, past the trigger, and every read would raise."""
    field = EncryptedField()

    stored = field.get_prep_value(f"{EncryptedField.PREFIX}hunter2")

    assert stored != f"{EncryptedField.PREFIX}hunter2"
    assert field.from_db_value(stored, None, None) == f"{EncryptedField.PREFIX}hunter2"


def test_nothing_at_all_is_stored_as_nothing_rather_than_as_a_ciphertext():
    """Enciphered, an empty value comes back non-empty, which every `if not value` reads as set."""
    assert EncryptedField().get_prep_value("") == ""


def test_the_plaintext_refusal_names_the_column_and_the_marker_it_looks_for():
    """A guard that looked for the wrong prefix would install and pass everything. A foreign key, so
    the column is not the attribute name and only `_meta` gets it right."""
    body = refuse_plaintext("user", EncryptedField.PREFIX)(Permission.user_set.through)

    assert "NEW.\"user_id\" <> ''" in body
    assert f"NEW.\"user_id\" NOT LIKE '{EncryptedField.PREFIX}%'" in body
    assert "RAISE EXCEPTION" in body
    assert "RETURN NEW" in body
    assert "None" not in body


def test_a_built_trigger_asks_its_builder_for_the_body_it_was_given():
    trigger = BuiltTrigger(
        name="probe", when=pgtrigger.Before, operation=pgtrigger.Insert, build=lambda model: f"-- {model.__name__}"
    )

    assert trigger.get_func(EncryptedField) == "-- EncryptedField"


@pytest.fixture
def credential_table(credential_key):
    """A throwaway model carrying the field and its trigger, created and installed inside the test's
    own transaction - no project model holds a secret yet, and this is the pairing one would declare."""
    with isolate_apps("apps.common"):

        class Credential(models.Model):
            secret = EncryptedField(blank=True)

            class Meta:
                app_label = "{{ cookiecutter.project_slug }}_common"
                triggers = [
                    BuiltTrigger(
                        name="refuse_a_secret_in_the_clear",
                        when=pgtrigger.Before,
                        operation=pgtrigger.Insert | pgtrigger.Update,
                        build=refuse_plaintext("secret", EncryptedField.PREFIX),
                    )
                ]

        with connection.schema_editor() as editor:
            editor.create_model(Credential)
        Credential._meta.triggers[0].install(Credential)
        yield Credential


def _execute(sql, params):
    # Its own savepoint: the failed statement aborts the transaction, and the test's has to survive.
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(sql, params)


@pytest.mark.django_db
def test_a_secret_written_through_the_field_lands_enciphered_and_reads_back_clear(credential_table):
    row = credential_table.objects.create(secret="hunter2")

    with connection.cursor() as cursor:
        cursor.execute(f"SELECT secret FROM {model_db_name(credential_table)} WHERE id = %s", [row.pk])
        (raw,) = cursor.fetchone()

    assert raw.startswith(EncryptedField.PREFIX)
    assert credential_table.objects.get(pk=row.pk).secret == "hunter2"


@pytest.mark.django_db
def test_a_raw_write_in_the_clear_is_refused_by_the_database(credential_table):
    """The whole point of the trigger: a writer that skips the field cannot land a plaintext secret."""
    row = credential_table.objects.create(secret="hunter2")
    table, column = model_db_name(credential_table), model_db_column(credential_table, "secret")

    with pytest.raises(ProgrammingError, match="takes enciphered values only"):
        _execute(f"UPDATE {table} SET {column} = %s WHERE id = %s", ["hunter2", row.pk])

    with pytest.raises(ProgrammingError, match="takes enciphered values only"):
        _execute(f"INSERT INTO {table} ({column}) VALUES (%s)", ["hunter2"])


@pytest.mark.django_db
def test_an_empty_secret_is_allowed_through(credential_table):
    """Blank means "not set", which is not a secret in the clear."""
    table, column = model_db_name(credential_table), model_db_column(credential_table, "secret")

    _execute(f"INSERT INTO {table} ({column}) VALUES (%s)", [""])

    assert credential_table.objects.get().secret == ""
