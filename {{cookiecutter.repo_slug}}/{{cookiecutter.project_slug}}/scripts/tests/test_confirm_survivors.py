"""What the registries refuse at load time, before a run can be scored against a bad entry."""

import pytest

from scripts import confirm_survivors


REASON = 'reason = "' + "a reason long enough to count as an actual explanation" + '"\n'


@pytest.fixture
def registries(tmp_path, monkeypatch):
    equivalents, exemptions = tmp_path / "mutation-equivalents.toml", tmp_path / "mutation-exemptions.toml"
    monkeypatch.setattr(confirm_survivors, "EQUIVALENTS", equivalents)
    monkeypatch.setattr(confirm_survivors, "EXEMPTIONS", exemptions)
    return equivalents, exemptions


def test_a_hashed_name_with_a_verified_by_loads(registries):
    equivalents, _ = registries
    equivalents.write_text(f'["a.x_f__mutmut__0123456789ab"]\n{REASON}verified_by = "a/t.py::test_it"\n')

    assert list(confirm_survivors.load_equivalents()) == ["a.x_f__mutmut__0123456789ab"]


def test_a_repeated_change_keeps_its_number(registries):
    equivalents, _ = registries
    equivalents.write_text(f'["a.x_f__mutmut__0123456789ab_1"]\n{REASON}')

    assert list(confirm_survivors.load_equivalents()) == ["a.x_f__mutmut__0123456789ab_1"]


@pytest.mark.parametrize(
    "entry,complaint",
    [
        (f'["a.x_f__mutmut_3"]\n{REASON}', "not named by its mutation"),
        (f'["a.x_f"]\n{REASON}', "not named by its mutation"),
        (f'["a.x_f__mutmut__0123456789ab"]\n{REASON}verified_by = "test_it"\n', "not a test's node id"),
        ('["a.x_f__mutmut__0123456789ab"]\nreason = "equivalent"\n', "needs a reason"),
        (f"[a.x_f__mutmut__0123456789ab]\n{REASON}", "nested table"),
    ],
)
def test_an_equivalent_entry_that_cannot_be_trusted_is_refused(registries, entry, complaint):
    equivalents, _ = registries
    equivalents.write_text(entry)

    with pytest.raises(SystemExit, match=complaint):
        confirm_survivors.load_equivalents()


def test_an_exemption_is_keyed_by_function(registries):
    _, exemptions = registries
    exemptions.write_text(f'["a.x_f"]\n{REASON}')

    assert list(confirm_survivors.load_exemptions()) == ["a.x_f"]


def test_a_single_mutant_in_the_function_keyed_registry_is_refused(registries):
    _, exemptions = registries
    exemptions.write_text(f'["a.x_f__mutmut__0123456789ab"]\n{REASON}')

    with pytest.raises(SystemExit, match="belongs in mutation-equivalents.toml"):
        confirm_survivors.load_exemptions()
