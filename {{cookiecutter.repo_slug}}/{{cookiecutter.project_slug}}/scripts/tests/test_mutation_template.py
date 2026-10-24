import pytest

from scripts import mutation_template


@pytest.mark.parametrize("seed", mutation_template.SEED_TESTS)
def test_every_seed_test_still_exists(seed):
    """A renamed seed would silently leave a stale template."""
    path, _, name = seed.partition("::")
    source = mutation_template.ROOT / path

    assert source.exists(), f"{path} is gone"
    assert f"def {name}(" in source.read_text(), f"{path} no longer defines {name}"
