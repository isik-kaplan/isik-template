#!/usr/bin/env bash
# Drafts the privacy policy and terms of service with app-privacy-policy-generator, filled from this project's
# answers, into the files the legal pages read. Optional, and only when run: its code is AGPL-3.0, so it is fetched
# into a temporary directory and run there, never copied into this repository. What it writes is a starting point
# for a lawyer, not a finished document.
#
#   bash scripts/generate-legal.sh [--force]
#
# Answers can be overridden through the environment:
#   LEGAL_OWNER       who the documents name as responsible (default: {{ cookiecutter.author_name }})
#   LEGAL_OWNER_TYPE  Individual or Company (default: Individual)
#   LEGAL_CONTACT     the contact address they give (default: {{ cookiecutter.author_email }})
#   LEGAL_POLICY      gdpr, simple or no-tracking (default: gdpr)
#   LEGAL_SERVICES    third-party services to name, comma-separated, as the generator spells them
#                     (default: Sentry{{ ',Expo' if cookiecutter.include_mobile }})
set -euo pipefail

cd "$(dirname "$0")/.."

# Pinned, so the page this drives is the one it was written against. Moving it is a reviewed change.
GENERATOR_REPOSITORY=https://github.com/nisrulz/app-privacy-policy-generator
GENERATOR_COMMIT=2848bb8493efddd44a62aa8d80a387e8dfc8df6d
HOSTED=https://app-privacy-policy-generator.nisrulz.com/
OUT={{ cookiecutter.project_slug }}-frontend/apps/web/src/legal/en
FILES=(privacy-policy terms-of-service)

manual() {
  cat >&2 <<MANUAL

Generate them by hand instead: open $HOSTED, answer its wizard with
  app name: {{ cookiecutter.project_name }}    contact: ${LEGAL_CONTACT:-{{ cookiecutter.author_email }}}
  platforms: Web{{ ', Android, iOS' if cookiecutter.include_mobile }}
and export each document as Markdown into:
  $OUT/privacy-policy.md
  $OUT/terms-of-service.md
MANUAL
  exit 1
}

if [ "${1:-}" != "--force" ]; then
  for name in "${FILES[@]}"; do
    if [ -s "$OUT/$name.md" ]; then
      echo "$OUT/$name.md already exists; rerun with --force to replace it." >&2
      exit 1
    fi
  done
fi

command -v docker >/dev/null || { echo "docker is needed to run the generator." >&2; manual; }
command -v curl >/dev/null || { echo "curl is needed to fetch the generator." >&2; manual; }

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir" 2>/dev/null || true' EXIT

echo "Fetching $GENERATOR_REPOSITORY at $GENERATOR_COMMIT..."
curl -fsSL "https://codeload.github.com/nisrulz/app-privacy-policy-generator/tar.gz/$GENERATOR_COMMIT" \
  | tar -xz -C "$workdir" --strip-components=1 || manual

image="${COMPOSE_PROJECT_NAME:-{{ cookiecutter.repo_slug }}}-legal-generator"
echo "Building the browser image (the e2e suite's own)..."
docker build -q -t "$image" e2e/playwright >/dev/null || manual

# Built by python3 rather than spliced into a string, so a quote in a name cannot break the JSON.
answers=$(
  LEGAL_OWNER="${LEGAL_OWNER:-{{ cookiecutter.author_name }}}" \
  LEGAL_OWNER_TYPE="${LEGAL_OWNER_TYPE:-Individual}" \
  LEGAL_CONTACT="${LEGAL_CONTACT:-{{ cookiecutter.author_email }}}" \
  LEGAL_POLICY="${LEGAL_POLICY:-gdpr}" \
  LEGAL_SERVICES="${LEGAL_SERVICES:-Sentry{{ ',Expo' if cookiecutter.include_mobile }}}" \
  python3 -c '
import json, os
print(json.dumps({
    "appName": "{{ cookiecutter.project_name }}",
    "owner": os.environ["LEGAL_OWNER"],
    "ownerType": os.environ["LEGAL_OWNER_TYPE"],
    "contact": os.environ["LEGAL_CONTACT"],
    "policy": os.environ["LEGAL_POLICY"],
    "platforms": ["Web"{{ ', "Android", "iOS"' if cookiecutter.include_mobile }}],
    "services": [name.strip() for name in os.environ["LEGAL_SERVICES"].split(",") if name.strip()],
}))'
)

echo "Generating..."
docker run --rm \
  -v "$workdir/public:/generator:ro" \
  -v "$PWD/scripts/generate-legal.mjs:/e2e/generate-legal.mjs:ro" \
  -e LEGAL_ANSWERS="$answers" \
  "$image" node generate-legal.mjs > "$workdir/documents.json" || manual

mkdir -p "$OUT"
python3 - "$workdir/documents.json" "$OUT" <<'PY'
import json, pathlib, sys
documents, out = json.loads(pathlib.Path(sys.argv[1]).read_text()), pathlib.Path(sys.argv[2])
for slug, markdown in documents.items():
    (out / f"{slug}.md").write_text(markdown)
    print(f"wrote {out / f'{slug}.md'}")
PY

python3 scripts/pre-commit/legal_version.py || true

cat <<DONE

Drafted by app-privacy-policy-generator ($GENERATOR_REPOSITORY). Read both documents, fill in anything the
generator left as a placeholder, and have them reviewed by someone qualified before launch: a generated policy
describes a generic app, not this one. The privacy policy page adds this site's cookie disclosure on its own.
DONE
