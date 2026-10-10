import pytest

from scripts import mutation_template


@pytest.mark.parametrize("seed", mutation_template.SEED_TESTS)
def test_every_seed_test_still_exists(seed):
    """A renamed seed is the one failure this subsystem cannot report: pytest matches nothing, and the
    template is left as whatever an older schema built, so every mutant is measured against it."""
    path, _, name = seed.partition("::")
    source = mutation_template.ROOT / path

    assert source.exists(), f"{path} is gone"
    assert f"def {name}(" in source.read_text(), f"{path} no longer defines {name}"
