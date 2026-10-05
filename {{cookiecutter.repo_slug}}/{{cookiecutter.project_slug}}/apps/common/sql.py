"""SQL bodies shared by more than one app's triggers. Every name comes from `apps.common.db`."""

from apps.common.db import model_db_column


def refuse_plaintext(field_name, prefix):
    """A trigger body refusing any value of `field_name` that does not carry its field's cipher prefix.

    The application enciphers on the way in - see `EncryptedField`. This is the half that makes that
    true rather than merely usual: a data migration, a fixture and `.update()` all reach the column
    without passing through the field's `get_prep_value`, and any of them could leave a secret in the
    clear.

    It holds no key and does no crypto, deliberately: pgcrypto takes its key as a query argument, which
    puts it in `pg_stat_activity` and every statement log. What the database is the right place for is
    the invariant. A prefix check guards against a mistake, not an attacker - anything able to run
    arbitrary SQL can write a plausible prefix.
    """

    def build(model):
        column = model_db_column(model, field_name)
        return f"""
    IF NEW."{column}" <> '' AND NEW."{column}" NOT LIKE '{prefix}%' THEN
        RAISE EXCEPTION
            'pgtrigger: "{column}" takes enciphered values only, and this one arrived in the clear';
    END IF;
    RETURN NEW;
"""

    return build
