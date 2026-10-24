"""pre_gen_project.py's checks, kept out of the templated hook so pytest and mutmut can reach them."""

import re


class AnswersInvalid(ValueError):
    """Raised with the exact message the hook should print and exit 1 over."""


REQUIRED_FIELDS = ("project_name", "description", "author_name", "author_email", "domain")

# Slugs name the Python package, Docker services and npm workspace.
SLUG_PATTERNS = {"project_slug": r"[a-z][a-z0-9_]*", "repo_slug": r"[a-z][a-z0-9-]*"}

# These answers also land unescaped in TS literals, shell strings, .env and .po files.
FORBIDDEN_CHARACTERS = {
    # Also inside single-quoted TS strings and a double-quoted shell echo.
    "project_name": "\"\\'`$",
    "description": '"\\',
    "author_email": '"\\',
}

DOMAIN_PATTERN = r"[a-z0-9.-]+"

# django.conf.locale.LANG_INFO keys (Django 5.2), mirrored because the hook runs without Django.
KNOWN_LANGUAGES = {
    "af",
    "ar",
    "ar-dz",
    "ast",
    "az",
    "be",
    "bg",
    "bn",
    "br",
    "bs",
    "ca",
    "ckb",
    "cs",
    "cy",
    "da",
    "de",
    "dsb",
    "el",
    "en",
    "en-au",
    "en-gb",
    "eo",
    "es",
    "es-ar",
    "es-co",
    "es-mx",
    "es-ni",
    "es-ve",
    "et",
    "eu",
    "fa",
    "fi",
    "fr",
    "fy",
    "ga",
    "gd",
    "gl",
    "he",
    "hi",
    "hr",
    "hsb",
    "ht",
    "hu",
    "hy",
    "ia",
    "id",
    "ig",
    "io",
    "is",
    "it",
    "ja",
    "ka",
    "kab",
    "kk",
    "km",
    "kn",
    "ko",
    "ky",
    "lb",
    "lt",
    "lv",
    "mk",
    "ml",
    "mn",
    "mr",
    "ms",
    "my",
    "nb",
    "ne",
    "nl",
    "nn",
    "no",
    "os",
    "pa",
    "pl",
    "pt",
    "pt-br",
    "ro",
    "ru",
    "sk",
    "sl",
    "sq",
    "sr",
    "sr-latn",
    "sv",
    "sw",
    "ta",
    "te",
    "tg",
    "th",
    "tk",
    "tr",
    "tt",
    "udm",
    "ug",
    "uk",
    "ur",
    "uz",
    "vi",
    "zh-cn",
    "zh-hans",
    "zh-hant",
    "zh-hk",
    "zh-mo",
    "zh-my",
    "zh-sg",
    "zh-tw",
}


def validate_required_fields(**fields: str) -> None:
    for field_name, value in fields.items():
        if not value.strip():
            raise AnswersInvalid(
                f"'{field_name}' is required and has no default - re-run cookiecutter and provide a real value."
            )


def validate_slugs(**slugs: str) -> None:
    for slug_name, value in slugs.items():
        pattern = SLUG_PATTERNS[slug_name]
        if not re.fullmatch(pattern, value):
            raise AnswersInvalid(
                f"'{slug_name}' ({value!r}) must match {pattern} - pick a project_name made of letters, digits, "
                f"spaces, '-' and '_', or answer '{slug_name}' directly."
            )


def validate_free_text(**fields: str) -> None:
    for field_name, value in fields.items():
        forbidden = sorted(set(FORBIDDEN_CHARACTERS[field_name]) & set(value))
        if forbidden:
            raise AnswersInvalid(f"'{field_name}' ({value!r}) can't contain {' '.join(forbidden)}.")


def validate_domain(domain: str) -> None:
    normalized = domain.strip().lower()
    if normalized in {"localhost", "127.0.0.1", "0.0.0.0"} or normalized.endswith(".localhost"):
        raise AnswersInvalid(
            f"'domain' ({domain!r}) can't be localhost or *.localhost - cross-subdomain session/CSRF "
            "cookies need a real registrable domain (Domain=.<domain>). Use a .test domain for local "
            "dev (e.g. myproject.test) and add it to /etc/hosts, or use your real deployment domain."
        )
    if "." not in normalized:
        raise AnswersInvalid(f"'domain' ({domain!r}) needs at least one dot, e.g. myproject.test or myproject.com.")
    if not re.fullmatch(DOMAIN_PATTERN, normalized):
        raise AnswersInvalid(f"'domain' ({domain!r}) can only contain letters, digits, '.' and '-'.")


def parse_requested_languages(languages: str) -> list[str]:
    return [code.strip() for code in languages.split(",") if code.strip()]


def validate_requested_languages(requested_languages: list[str]) -> None:
    if not requested_languages:
        raise AnswersInvalid("'languages' must list at least one language code, e.g. 'en' or 'en,tr'.")
    if requested_languages[0] != "en":
        raise AnswersInvalid(
            f"'languages' ({', '.join(requested_languages)}) must start with 'en' - every string in this "
            "template is authored in English first; other languages are translated from it, never instead of it."
        )
    duplicates = sorted({code for code in requested_languages if requested_languages.count(code) > 1})
    if duplicates:
        raise AnswersInvalid(f"'languages' lists the same language more than once: {', '.join(duplicates)}.")
    unknown = sorted(set(requested_languages) - KNOWN_LANGUAGES)
    if unknown:
        raise AnswersInvalid(
            f"Unknown languages: {', '.join(unknown)}. Valid values: {', '.join(sorted(KNOWN_LANGUAGES))}."
        )


def validate_answers(
    *,
    project_name: str,
    project_slug: str,
    repo_slug: str,
    description: str,
    author_name: str,
    author_email: str,
    domain: str,
    languages: str = "en",
) -> None:
    validate_required_fields(
        project_name=project_name,
        description=description,
        author_name=author_name,
        author_email=author_email,
        # Equivalent mutant if dropped from this call (see mutation-exemptions.toml): the
        # validate_domain() call right below independently rejects a blank/whitespace-only
        # domain too, via its own "needs at least one dot" check.
        domain=domain,
    )
    validate_slugs(project_slug=project_slug, repo_slug=repo_slug)
    validate_free_text(project_name=project_name, description=description, author_email=author_email)
    validate_domain(domain)
    validate_requested_languages(parse_requested_languages(languages))
