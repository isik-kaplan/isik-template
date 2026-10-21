import json
from pathlib import Path

import pytest


CONTEXTS_DIR = Path(__file__).parent / "contexts"

# Every background_jobs answer meets every storage answer, and each of those and the cache answers meet
# every other, in 9 bakes rather than all 36. A bug two answers make between them shows up here; one
# only three make together may not. The rows that run the backend suite are the contexts with the same
# answers (test_backend.py).
PAIRWISE = [
    ("celery-with-beat", "garage", "external", "redis"),
    ("celery-with-beat", "s3", "self", "database"),
    ("celery-with-beat", "disk", "self", "redis"),
    ("celery", "garage", "external", "database"),
    ("celery", "s3", "self", "redis"),
    ("celery", "disk", "external", "database"),
    ("inline", "garage", "self", "database"),
    ("inline", "s3", "external", "redis"),
    ("inline", "disk", "external", "redis"),
]


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
