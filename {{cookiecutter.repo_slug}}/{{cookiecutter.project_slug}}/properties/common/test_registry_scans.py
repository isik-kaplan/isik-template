"""The common app's scans over what it is handed: the app registry and a call stack."""

import _thread
from types import SimpleNamespace

import pytest
from hypothesis import given
from hypothesis import strategies as st
from isik.common.utils.strings import words_to_pascal

from apps.common import enum_names
from apps.common.logging import emit
from apps.common.logging.events import DECLARED


CHOICE_SETS = [
    (("open", "Open"), ("closed", "Closed")),
    (("", "None yet"), ("open", "Open"), ("closed", "Closed")),
    (("low", "Low"), ("high", "High")),
    ((None, "Unknown"), ("low", "Low"), ("high", "High")),
    # Values that can't be sorted against each other, so they can't be hashed and go unnamed.
    ((1, "One"), ("two", "Two")),
]
MODELS = st.lists(
    st.tuples(
        st.booleans(),
        st.dictionaries(st.sampled_from(["status", "kind", "level"]), st.sampled_from(range(len(CHOICE_SETS)))),
    ),
    max_size=3,
)


@given(models=MODELS)
def test_a_choice_set_is_named_only_after_its_one_hand_written_owner(models):
    """Blank and null drop out before comparing, so a set differing only by them has the same owners."""
    fakes, owners = [], {}
    # Every example also holds a set that can't be hashed, which must go unnamed.
    models = [*models, (False, {"unit": len(CHOICE_SETS) - 1})]
    for n, (generated, fields) in enumerate(models):
        name = ["Order", "Ticket", "Shipment", "Ledger"][n]
        declared = [SimpleNamespace(name=field, choices=list(CHOICE_SETS[index])) for field, index in fields.items()]
        attributes = {"_meta": SimpleNamespace(get_fields=lambda declared=declared: declared)}
        if generated:
            attributes["isik_generated"] = True
        fakes.append(type(name, (), attributes))
        for field, index in fields.items():
            normalized = tuple(pair for pair in CHOICE_SETS[index] if pair[0] not in ("", None))
            if index == len(CHOICE_SETS) - 1:
                continue
            owners.setdefault(normalized, set())
            if not generated:
                owners[normalized].add(f"{name}{words_to_pascal(field)}")

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(enum_names, "django_apps", SimpleNamespace(get_models=lambda: fakes))
        names = enum_names.enum_name_overrides()

    expected = {next(iter(held)): list(choices) for choices, held in owners.items() if len(held) == 1}
    assert names == expected


WRAPPERS = st.just(emit.__name__) | st.from_regex(r"mutmut\.[a-z_]{1,10}", fullmatch=True)


@pytest.mark.parametrize("beneath", ["nothing", "a module"])
@given(wrapper=WRAPPERS, module=st.from_regex(r"apps\.[a-z_]{1,10}", fullmatch=True))
def test_a_line_names_the_first_module_past_the_wrappers_or_nothing_if_none_is(beneath, wrapper, module):
    under = module if beneath == "a module" else None
    scope = {"__name__": wrapper, "_caller": emit._caller, "out": []}
    exec("def call():\n    out.append(_caller())\n", scope)
    target = scope["call"]
    if under is not None:
        outer = {"__name__": under, "inner": target}
        exec("def call():\n    inner()\n", outer)
        target = outer["call"]
    finished = _thread.allocate_lock()
    finished.acquire()
    outer_scope = {"__name__": wrapper, "target": target, "finished": finished}
    # The thread's first frame is a wrapper's too, so nothing of this test sits beneath the scan.
    exec("def start():\n    try:\n        target()\n    finally:\n        finished.release()\n", outer_scope)

    _thread.start_new_thread(outer_scope["start"], ())

    assert finished.acquire(timeout=5)
    assert scope["out"] == [under or ""]


LOGGED = sorted(
    name for name, event in DECLARED.items() if not event.audited and emit.LOGGER.isEnabledFor(event.severity)
)


@given(name=st.sampled_from(LOGGED), note=st.none() | st.text(max_size=20), value=st.text(max_size=10))
def test_a_line_carries_its_fields_and_a_note_only_when_given_one(logged, name, note, value):
    event = DECLARED[name]
    fields = dict.fromkeys(event.requires, value)
    logged.clear()

    emit.log(event, note=note, **fields)

    (line,) = logged
    assert line["event"] == name
    assert {key: line[key] for key in fields} == fields
    assert line.get("note") == note
    assert ("note" in line) == (note is not None)
