#!/usr/bin/env python
"""Post-generation setup."""

import json
import os
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path


PROJECT_NAME = {{ cookiecutter.project_name|tojson }}
PROJECT_SLUG = {{ cookiecutter.project_slug|tojson }}
DOMAIN = {{ cookiecutter.domain|tojson }}
INCLUDE_MOBILE = {{ cookiecutter.include_mobile }}
TLS_TERMINATION = {{ cookiecutter.tls_termination|tojson }}
BACKGROUND_JOBS = {{ cookiecutter.background_jobs|tojson }}
STORAGE = {{ cookiecutter.storage|tojson }}
WEBHOOKS = {{ cookiecutter.webhooks|tojson }}
AUTHOR_NAME = {{ cookiecutter.author_name|tojson }}
AUTHOR_EMAIL = {{ cookiecutter.author_email|tojson }}
# "en" first, always (validated in _validate.py).
LANGUAGES = [code.strip() for code in {{ cookiecutter.languages|tojson }}.split(",") if code.strip()]
EXTRA_LANGUAGES = LANGUAGES[1:]

WEB_SRC = Path(f"{PROJECT_SLUG}-frontend/apps/web/src")
LEGAL = WEB_SRC / "legal"
MOBILE_LIB = Path(f"{PROJECT_SLUG}-frontend/apps/mobile/lib")
# This file is a Jinja template, so an f-string's doubled-brace escape would be eaten by Jinja.
OPEN_BRACE, CLOSE_BRACE = "{", "}"

GENERATED_FILE_NOTICE = (
    "// Generated at bake time from cookiecutter's own \"languages\" answer (see\n"
    "// hooks/post_gen_project.py) - edit the source there, not this file, to change its shape.\n"
    "// Editing the locale json files themselves (the actual translations) is fine.\n\n"
)


def _po_header(language: str) -> str:
    year = datetime.now(tz=UTC).year
    return f"""# {PROJECT_NAME} translations.
# Copyright (C) {year} {AUTHOR_NAME}
# {AUTHOR_NAME} <{AUTHOR_EMAIL}>, {year}.
#
msgid ""
msgstr ""
"Project-Id-Version: {PROJECT_NAME}\\n"
"Report-Msgid-Bugs-To: \\n"
"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"
"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"
"Language-Team: LANGUAGE <LL@li.org>\\n"
"Language: {language}\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"
"""


def _blank_json_values(source: dict) -> dict:
    return {key: "" for key in source}


def _identifier(namespace: str, language: str) -> str:
    return namespace + "".join(part.capitalize() for part in language.split("-"))


def _const_array(name: str, items: list[str]) -> str:
    quoted = ", ".join(f"'{item}'" for item in items)
    one_line = f"export const {name} = [{quoted}] as const"
    if len(one_line) <= 120:
        return one_line
    body = "".join(f"  '{item}',\n" for item in items)
    return f"export const {name} = [\n{body}] as const"


def scaffold_translation_files() -> list[Path]:
    """One empty catalog per extra language, for a human to translate."""
    written = []
    web_namespaces = sorted(path.stem for path in (WEB_SRC / "locales" / "en").glob("*.json"))

    for language in EXTRA_LANGUAGES:
        po_path = Path(PROJECT_SLUG) / "locale" / language / "LC_MESSAGES" / "django.po"
        po_path.parent.mkdir(parents=True, exist_ok=True)
        po_path.write_text(_po_header(language))
        written.append(po_path)

        for namespace in web_namespaces:
            en_path = WEB_SRC / "locales" / "en" / f"{namespace}.json"
            out_path = WEB_SRC / "locales" / language / f"{namespace}.json"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(_blank_json_values(json.loads(en_path.read_text())), indent=2) + "\n")
            written.append(out_path)

        if INCLUDE_MOBILE:
            en_path = MOBILE_LIB / "locales" / "en.json"
            out_path = MOBILE_LIB / "locales" / f"{language}.json"
            out_path.write_text(json.dumps(_blank_json_values(json.loads(en_path.read_text())), indent=2) + "\n")
            written.append(out_path)

    return written, web_namespaces


def regenerate_web_i18n_config(web_namespaces: list[str]) -> None:
    """The checked-in i18n/config.ts only knows English."""
    import_lines = [
        f"import {_identifier(namespace, language)} from '../locales/{language}/{namespace}.json'"
        for language in sorted(LANGUAGES)
        for namespace in web_namespaces
    ]

    resource_blocks = []
    for language in LANGUAGES:
        entries = "\n".join(f"    {namespace}: {_identifier(namespace, language)}," for namespace in web_namespaces)
        resource_blocks.append(f"  {language}: {OPEN_BRACE}\n{entries}\n  {CLOSE_BRACE},")

    content = (
        "\n".join(import_lines)
        + "\n"
        + "import type { InitOptions, TFunction } from 'i18next'\n\n"
        + GENERATED_FILE_NOTICE
        + _const_array("languages", LANGUAGES)
        + "\n"
        + _const_array("namespaces", web_namespaces)
        + "\n\n"
        + "export type Language = (typeof languages)[number]\n"
        + "export type Namespace = (typeof namespaces)[number]\n\n"
        + "export const resources = {\n"
        + "\n".join(resource_blocks)
        + "\n} as const\n\n"
        + "export function getConfig(ns?: Namespace[], lng: Language = 'en'): InitOptions {\n"
        + "  return {\n"
        + "    fallbackLng: 'en',\n"
        + "    lng,\n"
        + "    ns: ns ?? namespaces,\n"
        + "    resources,\n"
        + "    // i18next escapes interpolated values by default, which React then renders literally.\n"
        + "    interpolation: { escapeValue: false },\n"
        + "  }\n"
        + "}\n\n"
        + "// What a function handed `t` should take - see i18next.d.ts for what makes its keys checked.\n"
        + "export type Translate = TFunction<Namespace[]>\n"
    )
    (WEB_SRC / "i18n" / "config.ts").write_text(content)


def regenerate_mobile_i18n() -> None:
    """The checked-in lib/i18n.ts only knows English."""
    import_lines = [
        f"import {_identifier('translation', language)} from './locales/{language}.json'"
        for language in sorted(LANGUAGES)
    ]
    resources_entries = "\n".join(
        f"    {language}: {OPEN_BRACE} translation: {_identifier('translation', language)} {CLOSE_BRACE},"
        for language in LANGUAGES
    )

    content = (
        "\n".join(import_lines)
        + "\n"
        + "import * as Localization from 'expo-localization'\n"
        + "import i18next from 'i18next'\n"
        + "import { initReactI18next, useTranslation } from 'react-i18next'\n\n"
        + GENERATED_FILE_NOTICE
        + _const_array("SUPPORTED_LANGUAGES", LANGUAGES)
        + "\n"
        + "type Language = (typeof SUPPORTED_LANGUAGES)[number]\n\n"
        + "function isSupported(code: string): code is Language {\n"
        + "  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)\n"
        + "}\n\n"
        + "// The device's own language, restricted to what this app actually ships - overridden once\n"
        + "// a signed-in user's own saved preference loads (see useAuthenticated.ts).\n"
        + "function deviceLanguage(): Language {\n"
        + "  for (const locale of Localization.getLocales()) {\n"
        + "    if (locale.languageCode && isSupported(locale.languageCode)) return locale.languageCode\n"
        + "  }\n"
        + "  return 'en'\n"
        + "}\n\n"
        + "i18next.use(initReactI18next).init({\n"
        + "  lng: deviceLanguage(),\n"
        + "  fallbackLng: 'en',\n"
        + "  resources: {\n"
        + resources_entries
        + "\n  },\n"
        + "  interpolation: { escapeValue: false },\n"
        + "})\n\n"
        + "export function setLanguage(language: string): void {\n"
        + "  if (isSupported(language) && language !== i18next.language) void i18next.changeLanguage(language)\n"
        + "}\n\n"
        + "export { useTranslation }\n"
        + "export default i18next\n"
    )
    (MOBILE_LIB / "i18n.ts").write_text(content)


def legal_checklist() -> str:
    """Legal documents still to write, read from the same definition the pages and signup render from."""
    slugs = [document["slug"] for document in json.loads((LEGAL / "documents.json").read_text())["documents"]]
    required = "\n".join(f"  [ ] {LEGAL / 'en' / f'{slug}.md'}" for slug in slugs)
    lines = [
        "Before launch, add the legal documents every signup agrees to. Until they exist, their pages say they",
        "have not been added yet and signups record no acceptance:",
        required,
    ]
    if EXTRA_LANGUAGES:
        translations = "\n".join(
            f"      {LEGAL / language / f'{slug}.md'}" for language in EXTRA_LANGUAGES for slug in slugs
        )
        lines += ["Translations are optional - English is shown in their place until they exist:", translations]
    lines += [
        "To draft them from this project's answers: bash scripts/generate-legal.sh (have the result reviewed).",
        "SETUP.md walks through this and everything else to do before launch.",
    ]
    return "\n".join(lines)


def generate_lock_files() -> list[str]:
    """Locks only after rendering: a lock file names the project's own slug, so a templated one would mismatch.

    Skipped under ISIK_TEMPLATE_SKIP_LOCKFILES for structural tests. Returns warnings rather than raising, so a
    missing uv/npm doesn't fail generation.
    """
    if os.environ.get("ISIK_TEMPLATE_SKIP_LOCKFILES"):
        return []

    warnings = []

    if shutil.which("uv") is None:
        warnings.append(
            f"uv not found on PATH - run `uv lock` inside {PROJECT_SLUG}/ yourself, then commit "
            "uv.lock before the backend Dockerfile's `uv sync --frozen` will work."
        )
    elif subprocess.run(["uv", "lock"], cwd=PROJECT_SLUG).returncode != 0:
        warnings.append(f"`uv lock` failed - fix the issue above, then rerun it inside {PROJECT_SLUG}/.")

    if shutil.which("npm") is None:
        warnings.append(
            f"npm not found on PATH - run `npm install` inside {PROJECT_SLUG}-frontend/ yourself, then "
            "commit package-lock.json before `npm ci` will work."
        )
    elif subprocess.run(["npm", "install"], cwd=f"{PROJECT_SLUG}-frontend").returncode != 0:
        warnings.append(f"`npm install` failed - fix the issue above, then rerun it inside {PROJECT_SLUG}-frontend/.")

    return warnings


def main() -> None:
    # Not a Jinja-conditional directory name: rendered empty, cookiecutter targets the existing "apps" and fails.
    if not INCLUDE_MOBILE:
        shutil.rmtree(f"{PROJECT_SLUG}-frontend/apps/mobile")
    # Same trick for local https: self mode already serves :443 off its own certificate.
    if TLS_TERMINATION == "self":
        shutil.rmtree(f"{PROJECT_SLUG}-server/dev-tls")
        os.remove("docker-compose.dev-tls.yml")
        # Stands in for the load balancer external mode puts in front; self mode has none.
        os.remove("e2e/docker-compose.tls-proxy-for-e2e.yml")
        os.remove("e2e/tls-proxy.conf")
    else:
        os.remove(f"{PROJECT_SLUG}-server/certificate.sh")
    # Services this project was generated without: tasks run inline, files go to disk.
    if BACKGROUND_JOBS == "inline":
        shutil.rmtree("broker")
    if STORAGE == "disk":
        shutil.rmtree("storage")
    notification_api = f"{PROJECT_SLUG}/apps/notifications/api"
    if WEBHOOKS == "none":
        for module in ("viewsets/endpoint.py", "viewsets/delivery.py"):
            os.remove(f"{notification_api}/{module}")
        os.remove(f"{PROJECT_SLUG}/apps/notifications/tests/test_webhooks.py")
    if WEBHOOKS != "staff":
        os.remove(f"{notification_api}/deployment.py")
        shutil.rmtree(f"{notification_api}/permissions")

    translation_files, web_namespaces = scaffold_translation_files()
    if EXTRA_LANGUAGES:
        regenerate_web_i18n_config(web_namespaces)
        if INCLUDE_MOBILE:
            regenerate_mobile_i18n()

    lock_warnings = generate_lock_files()

    subprocess.run(["git", "init", "-q"], check=True)

    print(f"\n{PROJECT_NAME} scaffolded.")
    print(
        "\nThis app is not servable at plain localhost - cross-subdomain session/CSRF cookies "
        f"need a real registrable domain. Before running docker compose, add to /etc/hosts:\n"
        f"  127.0.0.1 api.{DOMAIN} admin.{DOMAIN} auth.{DOMAIN}\n"
        "(or point real DNS at these subdomains if deploying to the real domain instead).\n"
    )

    if translation_files:
        file_list = "\n".join(f"  {path}" for path in translation_files)
        print(
            f"\n'languages' requested {', '.join(EXTRA_LANGUAGES)} beyond English - every string in "
            "this template is authored in English, so these need real translations before that "
            f"language ships:\n{file_list}\n"
            f"For the backend .po file, run `python manage.py makemessages -l {EXTRA_LANGUAGES[0]}` "
            "(repeat per language) inside the container as the project's own code grows strings to "
            "translate, then fill in msgstr and run `python manage.py compilemessages`.\n"
        )

    for warning in lock_warnings:
        print(f"\n{warning}\n")

    # Last, so everything above is on screen before setup.sh prompts for .env (it copies defaults without a tty).
    subprocess.run(["bash", "scripts/setup.sh"], check=True)

    # After setup.sh's prompts, so it is the last thing on screen.
    print(f"\n{legal_checklist()}\n")


if __name__ == "__main__":
    main()
