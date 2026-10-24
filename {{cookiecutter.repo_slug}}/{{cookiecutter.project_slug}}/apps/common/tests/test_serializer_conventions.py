"""Every serializer over a `BaseModel` lists both timestamps by hand, and none carries a version: that
travels in the `ETag` header alone.

`Meta.fields` rather than what a request renders: narrowing per request is its own decision.
"""

import importlib
import pkgutil

from django.apps import apps as django_apps
from isik.common.utils.exemptions import exemption_class
from isik.django.apps.common.db import BaseModel
from isik.django.drf.serializers import BaseModelSerializer
from rest_framework import serializers


TIMESTAMPS = ("created_at", "updated_at")

MissingTimestamps = exemption_class(
    "MissingTimestamps",
    rule="serializers.timestamps",
    why="A serializer over a BaseModel lists created_at and updated_at, so every client sees when a row changed.",
)

# Qualified name -> MissingTimestamps(reason=...); keyed by name, so a rename fails below.
EXEMPT = {}


def _declared_serializers():
    """Each app's `<app>/api/serializers`, by import path; a test module's inline subclass is never reached."""
    for app_config in django_apps.get_app_configs():
        try:
            package = importlib.import_module(f"{app_config.name}.api.serializers")
        except ModuleNotFoundError:
            continue
        # A lone `serializers.py` (apps.common's base class) is the module itself rather than a folder of them.
        modules = (
            [
                importlib.import_module(info.name)
                for info in pkgutil.iter_modules(package.__path__, f"{package.__name__}.")
            ]
            if hasattr(package, "__path__")
            else [package]
        )
        for module in modules:
            for name, value in vars(module).items():
                # Declared here rather than imported here, so each serializer is named once, where it lives.
                declared_here = isinstance(value, type) and value.__module__ == module.__name__
                if declared_here and issubclass(value, BaseModelSerializer):
                    yield f"{module.__name__}.{name}", value


def _over_a_base_model(serializer):
    model = getattr(getattr(serializer, "Meta", None), "model", None)
    return model is not None and issubclass(model, BaseModel)


def _missing(serializer):
    fields = serializer.Meta.fields
    return [] if fields == "__all__" else [field for field in TIMESTAMPS if field not in fields]


def test_a_serializer_over_a_base_model_lists_both_timestamps():
    missing = {
        name: _missing(serializer)
        for name, serializer in _declared_serializers()
        if _over_a_base_model(serializer) and name not in EXEMPT
    }

    assert {name: absent for name, absent in missing.items() if absent} == {}


def test_an_exemption_names_a_serializer_that_still_exists():
    """A stale exemption is worse than none: it reads as a decision about code that has since moved."""
    declared = {name for name, _ in _declared_serializers()}

    assert set(EXEMPT) <= declared


def test_an_exemption_says_why():
    """Typed, so the reason is held to its floor where it is written."""
    assert all(isinstance(reason, MissingTimestamps) for reason in EXEMPT.values())


def test_the_sweep_reaches_the_serializers_it_is_meant_to_check():
    """Discovery walks a layout convention; a changed layout would leave the checks above asserting nothing."""
    checked = {name for name, serializer in _declared_serializers() if _over_a_base_model(serializer)}

    assert "apps.users.api.serializers.user.UserSerializer" in checked


def test_all_fields_counts_as_listing_them():
    class Meta:
        fields = "__all__"

    assert _missing(type("Everything", (), {"Meta": Meta})) == []


def test_a_serializer_without_the_timestamps_is_caught():
    """The failing branch, run on purpose: it only executes when the codebase is wrong otherwise."""

    class Meta:
        fields = ["id", "created_at"]

    assert _missing(type("Partial", (), {"Meta": Meta})) == ["updated_at"]


def test_a_serializer_over_something_else_is_not_judged():
    class Meta:
        model = object

    assert not _over_a_base_model(type("Other", (), {"Meta": Meta}))
    assert not _over_a_base_model(type("NoMeta", (), {}))


def _carries_a_version(serializer):
    listed = getattr(getattr(serializer, "Meta", None), "fields", ())
    return "etag" in serializer._declared_fields or "etag" in listed


def test_no_serializer_carries_a_version_in_the_body():
    """One place for it: a body copy is one more thing a client can send back out of step with the header."""
    carrying = {name for name, serializer in _declared_serializers() if _carries_a_version(serializer)}

    assert carrying == set()


def test_a_serializer_carrying_a_version_is_caught():
    declared = type("Declared", (BaseModelSerializer,), {"etag": serializers.CharField()})
    listed = type("Listed", (BaseModelSerializer,), {"Meta": type("Meta", (), {"fields": ["id", "etag"]})})

    assert _carries_a_version(declared)
    assert _carries_a_version(listed)
    assert not _carries_a_version(BaseModelSerializer)
