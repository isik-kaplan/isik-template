"""SQL bodies shared by more than one app's triggers. Every name comes from `apps.common.db`."""

from apps.common.db import model_db_column


def refuse_plaintext(field_name, prefix):
    """Refuses a value without the cipher prefix: migrations, fixtures and `.update()` bypass the field.

    No crypto here, since pgcrypto would put the key in `pg_stat_activity`. Guards against mistakes, not attackers.
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
