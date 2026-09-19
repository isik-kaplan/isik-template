import json
from pathlib import Path


CONTEXTS_DIR = Path(__file__).parent / "contexts"


def load_context(name: str) -> dict:
    return json.loads((CONTEXTS_DIR / f"{name}.json").read_text())
