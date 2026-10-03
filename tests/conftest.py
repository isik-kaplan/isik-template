import json
from pathlib import Path

import pytest


CONTEXTS_DIR = Path(__file__).parent / "contexts"


def load_context(name: str) -> dict:
    return json.loads((CONTEXTS_DIR / f"{name}.json").read_text())


@pytest.fixture
def skip_lockfile_generation(monkeypatch):
    """Opt-in, not autouse: a bake that never installs anything (test_bake_structure.py,
    test_docker_compose.py's own config-only checks) shouldn't pay for `uv lock`/`npm install`
    just to check file layout. test_e2e.py and test_lockfiles.py request the real thing instead -
    one actually builds the Docker images `--frozen`/`npm ci` depend on, the other is what proves
    hooks/post_gen_project.py's generate_lock_files() still works at all."""
    monkeypatch.setenv("ISIK_TEMPLATE_SKIP_LOCKFILES", "1")
