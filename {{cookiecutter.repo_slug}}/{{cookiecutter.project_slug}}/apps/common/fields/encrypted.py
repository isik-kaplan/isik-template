"""Text stored enciphered and read back in the clear."""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models


class EncryptedField(models.TextField):
    """Text that is stored enciphered and read back in the clear - a credential to somebody else's
    system (an SMTP password, an API key) that a database dump should not carry off.

    Declare it and nothing else: `password = EncryptedField()`. Pair it on the model with a
    `BuiltTrigger(..., build=sql.refuse_plaintext("password", EncryptedField.PREFIX))`, which is what
    stops a migration or a raw update from reaching the column behind this field's back.

    Fernet, keyed from `CREDENTIAL_KEY` rather than `SECRET_KEY`: rotating a signing key is an ordinary
    thing to do, and it should not silently cost every stored secret.

    Without a key there is nothing to encipher with, and what happens then is the declaration's to say:
    the default refuses. `plaintext_without_a_key=True` stores it in the clear instead, for a secret
    worth less than always having it - such a column cannot also carry `refuse_plaintext`.
    """

    PREFIX = "fernet:"

    def __init__(self, *args, plaintext_without_a_key=False, **kwargs):
        self.plaintext_without_a_key = plaintext_without_a_key
        super().__init__(*args, **kwargs)

    def _cipher(self):
        from cryptography.fernet import Fernet

        if not settings.CREDENTIAL_KEY:
            raise ImproperlyConfigured("CREDENTIAL_KEY is unset, so there is nothing to encipher a stored secret with.")
        return Fernet(settings.CREDENTIAL_KEY.encode())

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        # No "already enciphered" skip: `from_db_value` deciphers on the way out, so this only ever sees
        # cleartext, and a skip would store a secret that merely starts with the prefix as it stands.
        if not value:
            return value
        if self.plaintext_without_a_key and not settings.CREDENTIAL_KEY:
            return value
        return self.PREFIX + self._cipher().encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value or not value.startswith(self.PREFIX):
            # An unenciphered row reads rather than raises, so one cannot take a page down.
            return value
        return self._cipher().decrypt(value.removeprefix(self.PREFIX).encode()).decode()
