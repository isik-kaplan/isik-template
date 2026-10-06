from django.apps import apps
from django.core.checks import Error, register

from apps.common.schema_docs import NoComment, NoHelpText


UNSAID_FIELDS = "schema_docs.E001"


@register()
def every_field_says_what_it_is_or_why_it_does_not(app_configs, **kwargs):
    """Both, because they reach different readers: `help_text` is the published API description and
    `db_comment` is what somebody in psql has instead of the docstring."""
    unsaid = sorted(
        {
            f"{where}.{field.name} ({kind})"
            for where, field in _fields_we_write()
            for kind, said, sentinel in (
                ("help_text", field.help_text, NoHelpText),
                ("db_comment", field.db_comment, NoComment),
            )
            if not said and not isinstance(said, sentinel)
        }
    )
    if not unsaid:
        return []

    return [
        Error(
            "Fields say nothing and do not say why: " + ", ".join(unsaid),
            hint="Give it one, or NoHelpText(reason=...) / NoComment(reason=...) from apps.common.schema_docs.",
            id=UNSAID_FIELDS,
        )
    ]


def _fields_we_write():
    """Our own concrete columns. An event table and a third-party abstract base leave no line of ours
    to hang a reason on. `creation_counter` tells an inherited clone from a redeclaration."""
    for model in apps.get_models():
        if not model.__module__.startswith("apps.") or model._meta.proxy:
            continue
        if getattr(model, "pgh_tracked_model", None) is not None:
            continue
        inherited = {
            (field.name, field.creation_counter)
            for base in model.__mro__
            for field in getattr(getattr(base, "_meta", None), "fields", ())
            if base._meta.abstract and not base.__module__.startswith("apps.")
        }
        ours = {
            (field.name, field.creation_counter): base.__name__
            for base in model.__mro__
            for field in getattr(getattr(base, "_meta", None), "fields", ())
            if base._meta.abstract and base.__module__.startswith("apps.")
        }
        for field in model._meta.local_fields:
            key = (field.name, field.creation_counter)
            if field.auto_created or key in inherited:
                continue
            # Named for the declaring class: one line on an abstract base serves every model under it.
            yield ours.get(key, model._meta.label), field
