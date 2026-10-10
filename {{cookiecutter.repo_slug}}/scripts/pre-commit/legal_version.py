"""Keeps apps/users/terms.py's TERMS_VERSION a hash of the legal documents the web app serves.

Rewrites it and exits 1 when it was stale, like the ruff hook beside it: stage the change and commit again. Standard
library only, so it runs straight off a checkout. The documents a signup agrees to are the ones documents.json names;
a translation counts as much as the English text, since either can change what somebody agreed to.
"""

import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LEGAL = ROOT / "{{ cookiecutter.project_slug }}-frontend" / "apps" / "web" / "src" / "legal"
TERMS = ROOT / "{{ cookiecutter.project_slug }}" / "apps" / "users" / "terms.py"
ASSIGNMENT = re.compile(r'^TERMS_VERSION = ".*"$', re.MULTILINE)


def documents(legal: Path) -> list[Path]:
    """Every published file for every document the definition names, in a stable order."""
    definition = json.loads((legal / "documents.json").read_text())
    slugs = [document["slug"] for document in definition["documents"]]
    languages = sorted(path for path in legal.iterdir() if path.is_dir())
    candidates = (language / f"{slug}.md" for language in languages for slug in slugs)
    return [path for path in candidates if path.is_file() and path.read_text().strip()]


def version(legal: Path) -> str:
    """Empty while nothing is published, so a signup then records no acceptance at all."""
    files = documents(legal)
    if not files:
        return ""
    digest = hashlib.sha256()
    for path in files:
        name = path.relative_to(legal).as_posix().encode()
        digest.update(name + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()[:12]


def main() -> int:
    current = TERMS.read_text()
    expected = ASSIGNMENT.sub(f'TERMS_VERSION = "{version(LEGAL)}"', current)
    if expected == current:
        return 0
    TERMS.write_text(expected)
    print(f"{TERMS.relative_to(ROOT)}: TERMS_VERSION updated; stage it, commit again.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
