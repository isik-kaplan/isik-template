import json
from pathlib import Path

import pytest


CONTEXTS_DIR = Path(__file__).parent / "contexts"

# Every pair of answers meets in 9 bakes rather than all 36; a bug needing three answers together may slip.
PAIRWISE = [
    ("celery-with-beat", "garage", "external", "redis", "none"),
    ("celery-with-beat", "s3", "external", "database", "staff"),
    ("celery-with-beat", "disk", "self", "redis", "users"),
    ("celery", "garage", "self", "redis", "staff"),
    ("celery", "s3", "external", "redis", "users"),
    ("celery", "disk", "external", "database", "none"),
    ("inline", "garage", "external", "database", "users"),
    ("inline", "s3", "self", "database", "none"),
    ("inline", "disk", "external", "redis", "staff"),
]


def load_context(name: str) -> dict:
    return json.loads((CONTEXTS_DIR / f"{name}.json").read_text())


@pytest.fixture
def skip_lockfile_generation(monkeypatch):
    """Opt-in, not autouse: test_e2e.py and test_lockfiles.py need the real lock files."""
    monkeypatch.setenv("ISIK_TEMPLATE_SKIP_LOCKFILES", "1")
