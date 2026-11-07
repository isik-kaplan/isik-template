import pytest
from cryptography.fernet import Fernet
from hypothesis import given
from hypothesis import strategies as st

from apps.common.fields import EncryptedField


# Surrogates are the one thing UTF-8 cannot encode.
SECRET = st.text(st.characters(exclude_categories=("Cs",)), min_size=1)


@pytest.fixture
def credential_key(settings):
    settings.CREDENTIAL_KEY = Fernet.generate_key().decode()


@given(secret=SECRET)
def test_what_is_stored_reads_back_as_what_was_written(secret, credential_key):
    field = EncryptedField()

    stored = field.get_prep_value(secret)

    assert stored.startswith(EncryptedField.PREFIX)
    assert field.from_db_value(stored, None, None) == secret


@given(secret=SECRET)
def test_without_a_key_a_field_that_allows_it_stores_the_cleartext(secret, settings):
    settings.CREDENTIAL_KEY = ""

    assert EncryptedField(plaintext_without_a_key=True).get_prep_value(secret) == secret


@given(
    plaintext_without_a_key=st.booleans(),
    null=st.booleans(),
    blank=st.booleans(),
    verbose_name=st.none() | st.text(min_size=1, max_size=12),
)
def test_a_declaration_survives_the_round_trip_through_a_migration(plaintext_without_a_key, null, blank, verbose_name):
    """A migration rebuilds the field from deconstruct(); an option it drops is gone from history."""
    field = EncryptedField(verbose_name, plaintext_without_a_key=plaintext_without_a_key, null=null, blank=blank)

    _, path, args, kwargs = field.deconstruct()
    rebuilt = EncryptedField(*args, **kwargs)

    assert path == "apps.common.fields.encrypted.EncryptedField"
    assert rebuilt.plaintext_without_a_key is plaintext_without_a_key
    assert (rebuilt.null, rebuilt.blank, rebuilt.verbose_name) == (null, blank, verbose_name)
