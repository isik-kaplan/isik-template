from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models


class EncryptedField(models.TextField):
    """A credential to another system, stored enciphered so a database dump does not carry it off.

    Pair it with `BuiltTrigger(..., build=sql.refuse_plaintext(...))` so nothing writes the column behind its back.
    Keyed from `CREDENTIAL_KEY`, not `SECRET_KEY`, so rotating the signing key does not lose every secret.
    Without a key it refuses, unless `plaintext_without_a_key=True` (incompatible with `refuse_plaintext`).
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
        # No "already enciphered" skip: this only sees cleartext, and a prefixed secret would be stored as is.
        if not value:
            return value
        if self.plaintext_without_a_key and not settings.CREDENTIAL_KEY:
            return value
        return self.PREFIX + self._cipher().encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value or not value.startswith(self.PREFIX):
            # An unenciphered row reads rather than raises.
            return value
        return self._cipher().decrypt(value.removeprefix(self.PREFIX).encode()).decode()
