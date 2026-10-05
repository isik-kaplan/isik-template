"""Names every published choice set after the model and field that own it.

drf-spectacular names an enum after the field alone, so two models with a `status` of different
choices end up sharing one component name, and the generator resolves that by hashing it into
something like `StatusF31Enum`. Every tracked model has a generated event twin carrying the same
field, so nothing would have a sole owner until those are excluded.
"""

from django.apps import apps as django_apps
from drf_spectacular.plumbing import list_hash
from isik.common.utils.strings import words_to_pascal


def _is_generated(model):
    return any(field.name.startswith("pgh_") for field in model._meta.get_fields())


def _choice_sets():
    sets = {}
    for model in django_apps.get_models():
        for field in model._meta.get_fields():
            choices = getattr(field, "choices", None)
            if not choices:
                continue
            normalized = [(value, label) for value, label in choices if value not in ("", None)]
            try:
                # The postprocessing hook drops blank and null before hashing; the two hashes match
                # only if this does too.
                key = list_hash(normalized)
            except TypeError:
                # An unsortable choice set. Unnamed is the fallback anyway.
                continue
            owners, _ = sets.setdefault(key, (set(), normalized))
            if not _is_generated(model):
                owners.add((model.__name__, field.name))
    return sets


def enum_name_overrides():
    """`{name: choices}`, the shape `ENUM_NAME_OVERRIDES` takes - it hashes the choices itself."""
    names = {}
    for owners, choices in _choice_sets().values():
        if len(owners) != 1:
            continue
        model_name, field_name = owners.pop()
        names[f"{model_name}{words_to_pascal(field_name)}"] = choices
    return names
