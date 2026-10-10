import json
import os
import runpy
from pathlib import Path

import pytest
import yaml
from conftest import load_context


pytestmark = pytest.mark.usefixtures("skip_lockfile_generation")


def _bake(cookies, context_name, **overrides):
    result = cookies.bake(extra_context={**load_context(context_name), **overrides})
    assert result.exit_code == 0, result.exception
    return result


def _slugs(project_path, project_slug):
    definition = project_path / f"{project_slug}-frontend/apps/web/src/legal/documents.json"
    return [document["slug"] for document in json.loads(definition.read_text())["documents"]]


def test_the_bake_ends_with_every_legal_file_to_write_at_its_exact_path(cookies, capfd):
    result = _bake(cookies, "default")
    slug = result.context["project_slug"]
    output = capfd.readouterr().out
    checklist = output[output.index("Before launch, add the legal documents") :]

    for document in _slugs(result.project_path, slug):
        path = f"{slug}-frontend/apps/web/src/legal/en/{document}.md"
        assert f"  [ ] {path}\n" in checklist
        # The checklist names files the pages really read: none exists until the owner writes it.
        assert not (result.project_path / path).exists()
        assert f"{slug}-frontend/apps/web/src/legal/tr/{document}.md" in checklist
    assert "bash scripts/generate-legal.sh" in checklist
    assert "SETUP.md" in checklist
    # Nothing printed after it: it is the last thing on screen.
    assert output.rstrip().endswith(checklist.rstrip())


def test_an_english_only_bake_lists_no_translations(cookies, capfd):
    result = _bake(cookies, "no-social-login")
    output = capfd.readouterr().out

    assert "Translations are optional" not in output
    assert f"{result.context['project_slug']}-frontend/apps/web/src/legal/en/privacy-policy.md" in output


def test_the_terms_and_the_privacy_policy_are_the_documents_a_signup_agrees_to(cookies):
    result = _bake(cookies, "no-social-login")

    assert _slugs(result.project_path, result.context["project_slug"]) == ["terms-of-service", "privacy-policy"]


@pytest.mark.parametrize("context_name", ["default", "no-social-login", "self-tls"])
def test_setup_md_is_linked_from_the_readme_and_covers_every_first_step(cookies, context_name):
    result = _bake(cookies, context_name)
    slug = result.context["project_slug"]
    setup = (result.project_path / "SETUP.md").read_text()

    assert "[SETUP.md](SETUP.md)" in (result.project_path / "README.md").read_text()
    for heading in ["Write `.env`", "first superuser", "DNS and TLS", "Legal documents", "Cookies and consent"]:
        assert heading in setup
    assert "bash scripts/setup.sh" in setup
    assert f"{slug}-frontend/apps/web/src/legal/en/<slug>.md" in setup
    assert f"node {slug}-frontend/apps/web/scripts/check-legal-documents.mjs" in setup
    assert "https://github.com/nisrulz/app-privacy-policy-generator" in setup
    assert "AGPL-3.0" in setup
    assert "reviewed by someone" in setup
    assert all(len(line) <= 120 for line in setup.splitlines()), "SETUP.md keeps to the 120-column limit"


def test_setup_md_follows_the_answers_that_change_what_there_is_to_set_up(cookies):
    default = (_bake(cookies, "default").project_path / "SETUP.md").read_text()
    bare = (_bake(cookies, "no-social-login").project_path / "SETUP.md").read_text()
    self_tls = (_bake(cookies, "self-tls").project_path / "SETUP.md").read_text()

    assert "https://auth.testproject.test/v0/provider-callback/google/login/callback/" in default
    assert "/v0/provider-callback/oidc/<PROVIDER_ID>/login/callback/" in default
    assert "Social login providers" not in bare
    assert "## 9. Translations" in default and "Translations" not in bare
    assert "## 10. The mobile app" in default and "mobile app" not in bare
    assert "certbot" in self_tls and "certbot" not in default
    assert "TLS-terminating load balancer" in default


def test_the_legal_generator_is_an_opt_in_script_that_never_vendors_the_generator(cookies):
    result = _bake(cookies, "default")
    script = result.project_path / "scripts/generate-legal.sh"

    assert os.access(script, os.X_OK)
    text = script.read_text()
    assert "GENERATOR_COMMIT=" in text
    assert '"platforms": ["Web", "Android", "iOS"]' in text
    # Fetched at run time into a temporary directory, never committed.
    assert not any("app-privacy-policy-generator" in path.name for path in result.project_path.rglob("*"))


def test_terms_version_is_kept_by_a_pre_commit_hook(cookies):
    result = _bake(cookies, "default")
    slug = result.context["project_slug"]

    config = yaml.safe_load((result.project_path / ".pre-commit-config.yaml").read_text())
    hooks = {hook["id"]: hook for repo in config["repos"] for hook in repo["hooks"]}
    assert hooks["legal-version"]["entry"] == "python scripts/pre-commit/legal_version.py"
    assert f"{slug}-frontend/apps/web/src/legal/" in hooks["legal-version"]["files"]
    ci = yaml.safe_load((result.project_path / ".github/workflows/ci.yml").read_text())
    (pre_commit,) = [step for step in ci["jobs"]["lint"]["steps"] if step.get("name") == "Run pre-commit"]
    assert "legal-version" not in pre_commit["env"]["SKIP"].split(",")


@pytest.fixture
def legal_version(cookies):
    result = _bake(cookies, "no-social-login")
    module = runpy.run_path(str(result.project_path / "scripts/pre-commit/legal_version.py"))
    return module, Path(module["LEGAL"]), Path(module["TERMS"])


def test_terms_version_is_empty_until_a_document_is_written(legal_version):
    module, legal, terms = legal_version

    assert module["version"](legal) == ""
    assert module["main"]() == 0
    assert 'TERMS_VERSION = ""' in terms.read_text()


def test_terms_version_hashes_every_document_and_every_translation(legal_version):
    module, legal, _ = legal_version
    (legal / "en").mkdir()
    (legal / "en" / "terms-of-service.md").write_text("# Terms\n")
    first = module["version"](legal)

    assert len(first) == 12 and int(first, 16) >= 0
    (legal / "en" / "terms-of-service.md").write_text("# Terms, amended\n")
    second = module["version"](legal)
    assert second != first
    (legal / "tr").mkdir()
    (legal / "tr" / "terms-of-service.md").write_text("# Koşullar\n")
    assert module["version"](legal) != second


def test_terms_version_ignores_what_no_signup_agrees_to(legal_version):
    module, legal, _ = legal_version
    (legal / "en").mkdir()
    (legal / "en" / "privacy-policy.md").write_text("# Privacy\n")
    before = module["version"](legal)

    (legal / "en" / "notes.md").write_text("not a document the definition names")
    (legal / "en" / "terms-of-service.md").write_text("  \n")
    assert module["version"](legal) == before


def test_a_stale_terms_version_is_rewritten_and_fails_the_hook_once(legal_version):
    module, legal, terms = legal_version
    (legal / "en").mkdir()
    (legal / "en" / "privacy-policy.md").write_text("# Privacy\n")

    assert module["main"]() == 1
    assert f'TERMS_VERSION = "{module["version"](legal)}"' in terms.read_text()
    assert module["main"]() == 0
