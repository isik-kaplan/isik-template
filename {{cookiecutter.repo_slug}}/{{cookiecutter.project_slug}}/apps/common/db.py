"""The one place that reads a model's `_meta` for SQL.

A hardcoded table name is a silent dependency on an app label: moving a model changes `db_table` with
no import to fail and nothing to catch it until a write path errors. `_meta` is private API, so it is
touched here and nowhere else.
"""


def model_db_name(model):
    """The model's table, unqualified. Works for auto-created M2M through models too."""
    return model._meta.db_table


def model_db_column(model, field_name):
    """The column behind a field, which is not always the attribute name - a `ForeignKey` stores
    `<name>_id`."""
    return model._meta.get_field(field_name).column
