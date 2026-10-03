#!/usr/bin/env python
"""Post-generation setup."""

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


PROJECT_NAME = "{{ cookiecutter.project_name }}"
PROJECT_SLUG = "{{ cookiecutter.project_slug }}"
DOMAIN = "{{ cookiecutter.domain }}"
INCLUDE_MOBILE = {{ cookiecutter.include_mobile }}
AUTHOR_NAME = "{{ cookiecutter.author_name }}"
AUTHOR_EMAIL = "{{ cookiecutter.author_email }}"
# "en" first, always - see hooks/_validate.py's own validate_requested_languages().
LANGUAGES = [code.strip() for code in "{{ cookiecutter.languages }}".split(",") if code.strip()]
EXTRA_LANGUAGES = LANGUAGES[1:]

WEB_SRC = Path(f"{PROJECT_SLUG}-frontend/apps/web/src")
MOBILE_LIB = Path(f"{PROJECT_SLUG}-frontend/apps/mobile/lib")
# This whole file is itself a Jinja template (cookiecutter renders it, then runs it - see
# pre_gen_project.py's own comment on the same thing) - an f-string's own doubled "{{"/"}}" brace
# escape reads as Jinja's own delimiter and never reaches Python at all. Single braces via a plain
# variable substitution (not doubled literal braces) side-step that entirely.
OPEN_BRACE, CLOSE_BRACE = "{", "}"

GENERATED_FILE_NOTICE = (
    "// Generated at bake time from cookiecutter's own \"languages\" answer (see\n"
    "// hooks/post_gen_project.py) - edit the source there, not this file, to change its shape.\n"
    "// Editing the locale json files themselves (the actual translations) is fine.\n\n"
)


def _po_header(language: str) -> str:
    year = datetime.now(tz=timezone.utc).year
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
    """One real, empty catalog per extra requested language - `en` is the only language with
    actual content; everything else here is deliberately blank for a human to fill in."""
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
    """Rewrites i18n/config.ts to import and register every requested language's own locale
    files - the checked-in version only knows about English."""
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
        + "import type { InitOptions } from 'i18next'\n\n"
        + GENERATED_FILE_NOTICE
        + _const_array("languages", LANGUAGES)
        + "\n"
        + _const_array("namespaces", web_namespaces)
        + "\n\n"
        + "export type Language = (typeof languages)[number]\n"
        + "export type Namespace = (typeof namespaces)[number]\n\n"
        + "const resources = {\n"
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
        + "}\n"
    )
    (WEB_SRC / "i18n" / "config.ts").write_text(content)


def regenerate_mobile_i18n() -> None:
    """Rewrites lib/i18n.ts to register every requested language and pick the initial one from
    the device's own locale (see expo-localization) rather than always defaulting to English."""
    import_lines = [f"import {_identifier('translation', language)} from './locales/{language}.json'" for language in sorted(LANGUAGES)]
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
        + "  // Stryker disable next-line StringLiteral: equivalent mutant, the same way and for the\n"
        + "  // same reason as the fallbackLng comment below - i18next resolves an empty lng through\n"
        + "  // fallbackLng regardless of what this placeholder actually is, landing on \"en\" either way.\n"
        + "  return 'en'\n"
        + "}\n\n"
        + "i18next.use(initReactI18next).init({\n"
        + "  lng: deviceLanguage(),\n"
        + "  // Stryker disable next-line StringLiteral: equivalent mutant. deviceLanguage() only ever\n"
        + "  // returns a language this app actually bundles resources for, so a missing *key* inside\n"
        + "  // that bundle is the only thing fallbackLng could ever catch here - and every key that\n"
        + "  // exists in \"en\" exists in every other bundle too (blank until translated, never absent\n"
        + "  // - see hooks/post_gen_project.py), so that never happens either.\n"
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


def generate_lock_files() -> list[str]:
    """Resolves and writes `uv.lock`/`package-lock.json` for the real, rendered project - safe
    only now, after cookiecutter has already resolved every placeholder, since a lock file's root
    package entry is self-referential (name = the project's own slug) and one baked into the
    template itself would mismatch every project generated under a different name (see both
    Dockerfiles' own history). Once committed, `uv sync --frozen`/`npm ci` (both Dockerfiles,
    every frontend CI job) stop re-resolving every dependency - runtime and dev tooling alike -
    on every single build, so two builds of the same commit can no longer resolve differently.

    Skipped under ISIK_TEMPLATE_SKIP_LOCKFILES - the template's own fast structural tests bake
    a dozen throwaway projects purely to check file layout and never run a single install; paying
    full dependency resolution twelve times over for that would be pure waste. tests/test_e2e.py
    and the real bake-real-ci sandbox run never set that flag, so the actual --frozen/npm ci
    Docker-build path this unlocks stays covered by a real install, not just a structural check.

    Returns what it skipped, in prose, for main() to tell the person if either tool was missing -
    not raised, since a missing uv/npm shouldn't fail generation outright, only this one step of
    it that's trivial to redo by hand.
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
    # .env.example already carries a real, working value for every field that has one (see its
    # own header comment) - domain, DB/broker names, and internal-only credentials are all
    # resolved via cookiecutter at generation time, so nothing here needs patching afterwards.
    shutil.copy(".env.example", ".env")

    # A Jinja-conditional directory *name* (cookiecutter's usual trick for an optional app - and
    # what this started as) turned out not to work here: when the name renders empty, cookiecutter
    # resolves the target path to its own parent ("apps"), which already exists as a sibling
    # directory's parent, and it refuses to overwrite that - the bake fails outright rather than
    # skipping the directory. Generating it unconditionally and deleting it here is what actually
    # works.
    if not INCLUDE_MOBILE:
        shutil.rmtree(f"{PROJECT_SLUG}-frontend/apps/mobile")

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


if __name__ == "__main__":
    main()
