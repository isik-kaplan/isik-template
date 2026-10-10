import json
import os
import subprocess
import tomllib
from pathlib import Path

import pytest
import yaml
from conftest import load_context


# Every test here bakes purely to check file layout, never to install anything - see
# conftest.py's skip_lockfile_generation.
pytestmark = pytest.mark.usefixtures("skip_lockfile_generation")


@pytest.mark.parametrize("context_name", ["default", "no-social-login", "self-tls"])
def test_bake_succeeds(cookies, context_name):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    assert result.exception is None
    assert result.project_path.is_dir()


def test_include_mobile_controls_whether_apps_mobile_exists(cookies):
    # default.json has include_mobile: true; no-social-login.json omits it, so it takes
    # cookiecutter.json's own default (false) - one bake exercises each side for free.
    with_mobile = cookies.bake(extra_context=load_context("default"))
    assert with_mobile.exit_code == 0
    mobile_dir = with_mobile.project_path / f"{with_mobile.context['project_slug']}-frontend/apps/mobile"
    assert mobile_dir.is_dir()
    assert (mobile_dir / "package.json").is_file()

    without_mobile = cookies.bake(extra_context=load_context("no-social-login"))
    assert without_mobile.exit_code == 0
    no_mobile_dir = without_mobile.project_path / f"{without_mobile.context['project_slug']}-frontend/apps/mobile"
    assert not no_mobile_dir.exists()


def test_repo_slug_derived_from_project_name(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "project_name": "My Cool App"})
    assert result.exit_code == 0
    assert result.project_path.name == "my-cool-app"


@pytest.mark.parametrize("context_name", ["default", "self-tls"])
def test_no_unrendered_jinja_in_output(cookies, context_name):
    # "self-tls" exercises tls_termination's own self-termination branch (certbot/nginx :443
    # blocks, entrypoint.sh's dummy-cert bootstrap) - every one of those lives inside a
    # {% if cookiecutter.tls_termination == "self" %} block that "default" (tls_termination:
    # "external") never renders at all.
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    # Any source file wrapped in {% raw %} is expected to still contain literal "{{"/"{%" in its
    # output - that's what raw means (Django template vars in email templates, i18next
    # interpolation in auth.json) - so check the source, not the rendered copy, for that marker.
    # Directory names under the template root are themselves Jinja ("{{cookiecutter.project_slug}}"
    # etc.), so the rendered relative path has to be translated back to the source one before we
    # can look the source file up.
    template_root = Path(__file__).parent.parent / "{{cookiecutter.repo_slug}}"
    raw_escaped_relative_paths = set()
    for source_path in template_root.rglob("*"):
        if not source_path.is_file():
            continue
        if "{% raw" in source_path.read_text(errors="ignore"):
            relative = source_path.relative_to(template_root).as_posix()
            rendered_relative = relative.replace("{{cookiecutter.project_slug}}", result.context["project_slug"])
            raw_escaped_relative_paths.add(rendered_relative)

    for path in result.project_path.rglob("*"):
        relative = path.relative_to(result.project_path).as_posix()
        if not path.is_file() or relative in raw_escaped_relative_paths:
            continue
        text = path.read_text(errors="ignore")
        # ci.yml needs a literal "${{ hashFiles(...) }}" (GitHub Actions' own expression syntax) in
        # its output, produced via the "{{ '${{' }}" Jinja string-literal escape rather than a raw
        # block - a real unrendered cookiecutter expression is never preceded by "$".
        assert "{{" not in text.replace("${{", ""), f"unrendered Jinja expression in {path}"
        assert "{%" not in text, f"unrendered Jinja tag in {path}"


def test_license_file_matches_choice(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "license": "MIT"})
    assert result.exit_code == 0
    assert "MIT License" in (result.project_path / "LICENSE").read_text()


@pytest.mark.parametrize(
    "override,reason",
    [
        ({"project_name": ""}, "blank project_name"),
        ({"description": ""}, "blank description"),
        ({"author_name": ""}, "blank author_name"),
        ({"author_email": ""}, "blank author_email"),
        ({"domain": ""}, "blank domain"),
        ({"domain": "localhost"}, "bare localhost domain"),
        ({"domain": "admin.localhost"}, "*.localhost domain"),
        ({"domain": "no-dot-domain"}, "domain with no dot"),
        ({"social_login_providers": "not-a-real-provider"}, "unknown provider slug"),
        ({"social_login_provider_icons": "no-equals-sign"}, "icon entry missing '='"),
        ({"social_login_provider_icons": "=https://example.test/x.svg"}, "icon entry with blank provider id"),
        ({"social_login_provider_icons": "google="}, "icon entry with blank url"),
        (
            {"social_login_provider_icons": "not-a-real-provider=https://example.test/x.svg"},
            "icon for unknown provider",
        ),
        (
            {"social_login_provider_icons": "google=https://a.test/g.svg,google=https://b.test/g2.svg"},
            "icon entry listing the same provider twice",
        ),
        (
            {"social_login_provider_icons": "slack=https://example.test/slack.svg"},
            "icon for a provider not in social_login_providers",
        ),
    ],
)
def test_pre_gen_validation_rejects(cookies, override, reason):
    result = cookies.bake(extra_context={**load_context("default"), **override})
    assert result.exit_code != 0, f"expected rejection for {reason}"


def test_all_keyword_accepted_for_providers(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "social_login_providers": "all"})
    assert result.exit_code == 0


def test_social_login_provider_icons_renders_into_socialProviders_ts(cookies):
    # openid_connect - one of default.json's own social_login_providers - has no bundled brand
    # icon (apps/web/src/components/app-auth/icons/brands.tsx), so this is the realistic case a
    # deployment would actually configure. google, also requested but left unconfigured here,
    # exercises the "" (no override, bundled icon wins) side of the same render.
    result = cookies.bake(
        extra_context={
            **load_context("default"),
            "social_login_provider_icons": "openid_connect=https://example.test/idp-icon.svg",
        }
    )
    assert result.exit_code == 0

    social_providers_ts = (
        result.project_path
        / f"{result.context['project_slug']}-frontend"
        / "apps"
        / "web"
        / "src"
        / "lib"
        / "socialProviders.ts"
    ).read_text()
    assert "icon: 'https://example.test/idp-icon.svg'" in social_providers_ts
    assert "{ id: 'google', name: 'Google', icon: '' }" in social_providers_ts


def test_frontend_ci_runs_the_suites_in_the_dockerfile_tester_image(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    dockerfile = (result.project_path / f"{result.context['project_slug']}-frontend/apps/web/Dockerfile").read_text()
    # From `deps`, not `builder`: a unit run should not wait on a production build it never reads.
    assert "FROM deps AS tester" in dockerfile
    assert dockerfile.index("AS tester") < dockerfile.index("AS builder")
    ci = (result.project_path / ".github" / "workflows" / "ci.yml").read_text()
    jobs = {name: ci.split(f"\n  {name}:\n", 1)[1].split("\n\n  ", 1)[0] for name in ("frontend", "frontend-mutation")}
    for job in jobs.values():
        assert "--target tester" in job
        assert "setup-node" not in job
        assert "npm ci" not in job
    # One job per shard, each mutating its own files and gated by check-mutants rather than Stryker's break.
    assert "fromJSON(needs.frontend-mutation-shards.outputs.list)" in jobs["frontend-mutation"]
    assert "node scripts/mutation-shards.mjs ${{ matrix.shard }}" in jobs["frontend-mutation"]
    assert "node ../../packages/mutation-check/check-mutants.mjs ." in jobs["frontend-mutation"]


def test_extra_languages_keep_translation_keys_typed(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    src = result.project_path / f"{result.context['project_slug']}-frontend/apps/web/src"
    config_ts = (src / "i18n" / "config.ts").read_text()
    # i18next.d.ts reads the English bundle off `resources`, so the regenerated config must export it.
    assert "export const resources = {" in config_ts
    assert "export type Translate = TFunction<Namespace[]>" in config_ts
    assert "import commonTr from '../locales/tr/common.json'" in config_ts
    assert (src / "i18n" / "i18next.d.ts").is_file()
    english = json.loads((src / "locales" / "en" / "common.json").read_text())
    turkish = json.loads((src / "locales" / "tr" / "common.json").read_text())
    assert turkish == {key: "" for key in english}


def test_object_storage_is_configured_everywhere_the_backend_runs(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    prefix = result.context["config_prefix"]
    env_example = (result.project_path / ".env.example").read_text()
    for key in ("BUCKET_NAME", "ENDPOINT_URL", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "REGION_NAME"):
        assert f"\n{prefix}__STORAGE__{key}=" in env_example
    assert f"\n{prefix}__STORAGE__ENDPOINT_URL=http://storage:4566\n" in env_example
    # The suite writes to real LocalStack, so every CI job that runs it has to start one.
    ci = (result.project_path / ".github" / "workflows" / "ci.yml").read_text()
    assert ci.count("up -d --wait --wait-timeout 90 database storage") == 2


def test_tls_termination_self_adds_certbot_and_443(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0

    server_dir = f"{result.context['project_slug']}-server"
    compose = (result.project_path / "docker-compose.yml").read_text()
    nginx_conf = (result.project_path / server_dir / "template.nginx.conf").read_text()
    dockerfile = (result.project_path / server_dir / "Dockerfile").read_text()
    env_example = (result.project_path / ".env.example").read_text()

    assert "certbot:" in compose
    assert '"443:443"' in compose
    assert "letsencrypt:" in compose
    assert "listen 443 ssl" in nginx_conf
    assert "acme-challenge" in nginx_conf
    assert "apk add --no-cache openssl" in dockerfile
    assert f"{result.context['config_prefix']}__TLS__ACME_EMAIL" in env_example


def test_tls_termination_external_has_no_certbot_or_443(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    server_dir = f"{result.context['project_slug']}-server"
    compose = (result.project_path / "docker-compose.yml").read_text()
    nginx_conf = (result.project_path / server_dir / "template.nginx.conf").read_text()
    dockerfile = (result.project_path / server_dir / "Dockerfile").read_text()
    env_example = (result.project_path / ".env.example").read_text()

    assert "certbot" not in compose
    assert "443" not in compose
    assert "listen 443" not in nginx_conf
    assert "acme-challenge" not in nginx_conf
    assert "openssl" not in dockerfile
    assert "__TLS__ACME_EMAIL" not in env_example


@pytest.mark.parametrize("context_name", ["default", "self-tls"])
def test_nginx_drops_unknown_hosts_and_sets_the_forwarded_host_itself(cookies, context_name):
    """The frontend builds its server-side fetch URLs from the forwarded host, so no client may choose it."""
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    nginx_conf = (result.project_path / f"{result.context['project_slug']}-server" / "template.nginx.conf").read_text()

    default_server = nginx_conf.split("listen 80 default_server;")[1].split("server {")[0]
    assert "return 444;" in default_server
    assert 'return 200 "ok";' in default_server
    assert nginx_conf.count("proxy_set_header X-Forwarded-Host $host;") == nginx_conf.count("http://frontend_app;")


def test_self_tls_refuses_unknown_names_and_sends_hsts(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0

    nginx_conf = (result.project_path / f"{result.context['project_slug']}-server" / "template.nginx.conf").read_text()

    assert "listen 443 ssl default_server;\n        ssl_reject_handshake on;" in nginx_conf
    assert 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' in nginx_conf


def test_external_tls_sends_no_hsts_from_nginx(cookies):
    """Behind the load balancer nginx speaks plain http, where the header means nothing; Django sends it."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    nginx_conf = (result.project_path / f"{result.context['project_slug']}-server" / "template.nginx.conf").read_text()

    assert "Strict-Transport-Security" not in nginx_conf
    assert "ssl_reject_handshake" not in nginx_conf


def test_ci_checks_the_production_settings(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    ci = yaml.safe_load((result.project_path / ".github" / "workflows" / "ci.yml").read_text())
    runs = [step.get("run", "") for step in ci["jobs"]["backend"]["steps"]]
    (deploy_check,) = [run for run in runs if "check --deploy" in run]
    assert f"-e {result.context['config_prefix']}__DEBUG=false" in deploy_check
    assert "--fail-level WARNING" in deploy_check


@pytest.mark.parametrize(
    ("context_name", "default_count", "env_example_line", "setup_writes_count"),
    [
        # nginx is the edge: nothing to ask, and local development has the same shape as production.
        ("self-tls", 1, "#{prefix}__TRUSTED_PROXY_COUNT=", False),
        # A load balancer sits in front in production, but not in local development.
        ("default", 2, "{prefix}__TRUSTED_PROXY_COUNT=1", True),
    ],
)
def test_trusted_proxy_count_follows_tls_termination(
    cookies, context_name, default_count, env_example_line, setup_writes_count
):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    prefix = result.context["config_prefix"]
    backend = result.project_path / result.context["project_slug"]
    config_py = (backend / result.context["project_slug"] / "config.py").read_text()
    settings_py = (backend / result.context["project_slug"] / "settings.py").read_text()
    env_example = (result.project_path / ".env.example").read_text().splitlines()
    setup_sh = (result.project_path / "scripts" / "setup.sh").read_text()

    assert f'"TRUSTED_PROXY_COUNT": integer(missing_default={default_count})' in config_py
    assert "ALLAUTH_TRUSTED_PROXY_COUNT = config.TRUSTED_PROXY_COUNT" in settings_py
    assert env_example_line.format(prefix=prefix) in env_example
    assert ('set_var "${PREFIX}__TRUSTED_PROXY_COUNT"' in setup_sh) is setup_writes_count


def test_credential_key_is_documented_and_generated_for_a_deployment(cookies):
    # Optional for local development (an EncryptedField just refuses to store a secret), so it is a
    # commented-out Missing Default there - but a deployment needs one, which setup.sh mints.
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    key = f"{result.context['config_prefix']}__CREDENTIAL_KEY"
    env_example = (result.project_path / ".env.example").read_text()
    setup = (result.project_path / "scripts" / "setup.sh").read_text()
    config = result.project_path / result.context["project_slug"] / result.context["project_slug"] / "config.py"

    assert f"\n#{key}=\n" in env_example
    assert 'set_var "${PREFIX}__CREDENTIAL_KEY"' in setup
    assert '"CREDENTIAL_KEY": string(missing_default="")' in config.read_text()


def test_log_sinks_are_named_after_the_project(cookies):
    # The audit logger's "cannot be turned down" is its own LOGGING entry, matched by name - a
    # settings key spelled differently from the logger emit.py takes would leave it propagating.
    result = cookies.bake(extra_context={**load_context("default"), "project_name": "Audit Me"})
    assert result.exit_code == 0

    slug = result.context["project_slug"]
    backend = result.project_path / slug
    emit = (backend / "apps" / "common" / "logging" / "emit.py").read_text()
    settings = (backend / slug / "settings.py").read_text()
    env_example = (result.project_path / ".env.example").read_text()

    assert f'logging.getLogger("{slug}")' in emit
    assert f'logging.getLogger("{slug}.audit")' in emit
    assert f'"{slug}.audit": {{"level": "INFO", "handlers": ["stdout"], "propagate": False}}' in settings
    assert "before_send=scrub_event" in settings
    assert "send_default_pii=False" in settings
    for name in ("FORMAT", "REQUESTS", "SLOW_REQUEST_MS"):
        assert f"#{result.context['config_prefix']}__LOGGING__{name}=" in env_example


@pytest.mark.parametrize(("context_name", "union"), [("default", '"en" | "tr"'), ("no-social-login", '"en"')])
def test_the_generated_api_client_carries_the_languages_answer(cookies, context_name, union):
    # packages/api's schema.ts is openapi-typescript's output for the baked project's own document,
    # and the language enum is the one place that document depends on an answer. The baked project's
    # openapi-check is what fails if the two ever disagree.
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    schema = result.project_path / f"{result.context['project_slug']}-frontend/packages/api/src/schema.ts"
    assert f"        UserLanguage: {union};\n" in schema.read_text()


def test_the_contract_checks_are_wired_into_pre_commit_and_ci(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0
    slug = result.context["project_slug"]

    config = yaml.safe_load((result.project_path / ".pre-commit-config.yaml").read_text())
    hooks = {hook["id"]: hook for repo in config["repos"] for hook in repo["hooks"]}
    assert hooks["openapi-check"]["entry"] == "scripts/pre-commit/openapi_check.sh"
    assert hooks["layout-check"]["entry"] == f"python {slug}/scripts/layout_check.py"
    assert os.access(result.project_path / "scripts/pre-commit/openapi_check.sh", os.X_OK)
    assert (result.project_path / slug / "scripts/layout_check.py").is_file()

    ci = yaml.safe_load((result.project_path / ".github/workflows/ci.yml").read_text())
    (pre_commit,) = [step for step in ci["jobs"]["lint"]["steps"] if step.get("name") == "Run pre-commit"]
    skipped = pre_commit["env"]["SKIP"].split(",")
    # layout-check needs nothing but Python, so the fast job keeps it; openapi-check runs in `schema`.
    assert "openapi-check" in skipped
    assert "layout-check" not in skipped
    assert "scripts/pre-commit/openapi_check.sh" in [step.get("run") for step in ci["jobs"]["schema"]["steps"]]
    assert "schema" in ci["jobs"]["e2e"]["needs"]


@pytest.mark.parametrize("context_name", ["default", "no-social-login"])
def test_every_verified_by_names_a_test_file_the_bake_ships(cookies, context_name):
    # A `verified_by` buys its mutant out of the re-run, so one pointing at a test file that a given
    # bake leaves out would leave that mutant re-checked by nothing at all.
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    backend = result.project_path / result.context["project_slug"]
    equivalents = tomllib.loads((backend / "mutation-equivalents.toml").read_text())
    exemptions = tomllib.loads((backend / "mutation-exemptions.toml").read_text())

    assert all("__mutmut__" in name for name in equivalents)
    assert not any("__mutmut_" in name for name in exemptions)
    for name, entry in equivalents.items():
        if "verified_by" in entry:
            path, _, test = entry["verified_by"].partition("::")
            assert f"def {test}(" in (backend / path).read_text(), name


def test_tls_termination_external_offers_local_https_as_an_override(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    server_dir = result.project_path / f"{result.context['project_slug']}-server"
    nginx_conf = (server_dir / "template.nginx.conf").read_text()
    override = (result.project_path / "docker-compose.dev-tls.yml").read_text()
    env_example = (result.project_path / ".env.example").read_text()
    script = result.project_path / "scripts" / "dev-tls.sh"

    # Both server blocks include the snippet, so :443 serves exactly the routes :80 does.
    assert nginx_conf.count("include /etc/nginx/extra-listen/*.conf;") == 2
    assert "__HTTPS_PORT:-443}:443" in override
    assert "dev-tls:/etc/nginx/extra-listen:ro" in override
    assert "dev-tls:/etc/dev-tls:ro" in override
    assert os.access(script, os.X_OK)
    assert "listen 443 ssl;" in script.read_text()
    assert (server_dir / "dev-tls" / ".gitignore").exists()
    assert "dev-tls" in (server_dir / ".dockerignore").read_text()
    assert f"{result.context['config_prefix']}__HTTPS_PORT" in env_example
    assert "NODE_EXTRA_CA_CERTS" in env_example


def test_tls_termination_self_has_no_local_https_override(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0

    server_dir = result.project_path / f"{result.context['project_slug']}-server"
    nginx_conf = (server_dir / "template.nginx.conf").read_text()

    assert not (result.project_path / "docker-compose.dev-tls.yml").exists()
    assert not (server_dir / "dev-tls").exists()
    assert "dev-tls" not in nginx_conf
    assert "dev-tls" not in (result.project_path / "docker-compose.yml").read_text()
    assert "__HTTPS_PORT" not in (result.project_path / ".env.example").read_text()
    # Present, so following the README of an external-mode project never hits "no such file" - but it
    # refuses, since this mode already serves https off its own certificate.
    proc = subprocess.run(["bash", "scripts/dev-tls.sh"], cwd=result.project_path, capture_output=True, text=True)
    assert proc.returncode == 1
    assert "already serves https" in proc.stderr
