"""The one place SQL reads `_meta` (private API): a hardcoded table name breaks silently when a model moves."""


def model_db_name(model):
    """Unqualified; works for auto-created M2M through models too."""
    return model._meta.db_table


def model_db_column(model, field_name):
    return model._meta.get_field(field_name).column
