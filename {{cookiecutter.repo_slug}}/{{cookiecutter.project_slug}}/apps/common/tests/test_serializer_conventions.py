"""Every serializer over a `BaseModel` lists both timestamps, by hand - there is no mixin adding them.

`Meta.fields` rather than what a request renders: narrowing per request is its own decision.
"""

import importlib
import pkgutil

from django.apps import apps as django_apps
from isik.django.apps.common.db import BaseModel
from isik.django.drf.serializers import BaseModelSerializer


TIMESTAMPS = ("created_at", "updated_at")

# Qualified name -> why. Keyed by name, so a rename fails below rather than keeping the hole open.
EXEMPT = {}


def _declared_serializers():
    """Every serializer each app declares under `<app>/api/serializers`, one module per serializer,
    named by the path a caller imports it from. A test module's inline subclass is nobody's API and
    is never reached, because nothing here imports it."""
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
    assert all(len(reason) >= 40 for reason in EXEMPT.values())


def test_the_sweep_reaches_the_serializers_it_is_meant_to_check():
    """Discovery walks a layout convention, so a changed layout would leave the checks above
    asserting nothing at all."""
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
