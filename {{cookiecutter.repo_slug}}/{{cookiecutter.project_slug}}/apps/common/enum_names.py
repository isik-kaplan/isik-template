"""Names each choice set after its owning model and field, not drf-spectacular's hashed `StatusF31Enum`.

Models isik generates are left out, or no field would have a sole owner; isik names theirs.
"""

from django.apps import apps as django_apps
from drf_spectacular.plumbing import list_hash
from isik.common.utils.strings import words_to_pascal


def _is_generated(model):
    return getattr(model, "isik_generated", None) is not None


def _choice_sets():
    sets = {}
    for model in django_apps.get_models():
        for field in model._meta.get_fields():
            choices = getattr(field, "choices", None)
            if not choices:
                continue
            normalized = [(value, label) for value, label in choices if value not in ("", None)]
            try:
                # Must match the postprocessing hook, which drops blank and null before hashing.
                key = list_hash(normalized)
            except TypeError:
                # Unsortable; left unnamed.
                continue
            owners, _ = sets.setdefault(key, (set(), normalized))
            if not _is_generated(model):
                owners.add((model.__name__, field.name))
    return sets


def enum_name_overrides():
    """`{name: choices}` for `ENUM_NAME_OVERRIDES`, which hashes the choices itself."""
    names = {}
    for owners, choices in _choice_sets().values():
        if len(owners) != 1:
            continue
        model_name, field_name = owners.pop()
        names[f"{model_name}{words_to_pascal(field_name)}"] = choices
    return names
