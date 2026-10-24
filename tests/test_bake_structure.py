import ast
import json
import os
import subprocess
import tomllib
from pathlib import Path

import pytest
import yaml
from conftest import load_context


pytestmark = pytest.mark.usefixtures("skip_lockfile_generation")


CONTEXTS = sorted(path.stem for path in (Path(__file__).parent / "contexts").glob("*.json"))


@pytest.mark.parametrize("context_name", CONTEXTS)
def test_bake_succeeds(cookies, context_name):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    assert result.exception is None
    assert result.project_path.is_dir()


def test_include_mobile_controls_whether_apps_mobile_exists(cookies):
    # minimal.json omits include_mobile, so it also covers cookiecutter.json's default.
    with_mobile = cookies.bake(extra_context=load_context("default"))
    assert with_mobile.exit_code == 0
    mobile_dir = with_mobile.project_path / f"{with_mobile.context['project_slug']}-frontend/apps/mobile"
    assert mobile_dir.is_dir()
    assert (mobile_dir / "package.json").is_file()

    without_mobile = cookies.bake(extra_context=load_context("minimal"))
    assert without_mobile.exit_code == 0
    no_mobile_dir = without_mobile.project_path / f"{without_mobile.context['project_slug']}-frontend/apps/mobile"
    assert not no_mobile_dir.exists()


def test_repo_slug_derived_from_project_name(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "project_name": "My Cool App"})
    assert result.exit_code == 0
    assert result.project_path.name == "my-cool-app"


@pytest.mark.parametrize("context_name", CONTEXTS)
def test_no_unrendered_jinja_in_output(cookies, context_name):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    # Files using a raw block legitimately keep Jinja-looking text, so find them by their source path.
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
        # GitHub Actions expressions start with "$"; an unrendered cookiecutter one never does.
        assert "{{" not in text.replace("${{", ""), f"unrendered Jinja expression in {path}"
        assert "{%" not in text, f"unrendered Jinja tag in {path}"


@pytest.mark.parametrize(
    ("license_name", "opening"),
    [
        ("MIT", "MIT License"),
        ("Apache-2.0", "This project is licensed under the Apache-2.0 license."),
        ("BSD-3-Clause", "BSD 3-Clause License"),
        ("GPL-3.0", "This project is licensed under the GPL-3.0 license."),
        ("Unlicense", "This is free and unencumbered software released into the public domain."),
        ("Proprietary", "All rights reserved."),
    ],
)
def test_license_file_matches_choice(cookies, license_name, opening):
    result = cookies.bake(extra_context={**load_context("default"), "license": license_name})
    assert result.exit_code == 0
    assert opening in (result.project_path / "LICENSE").read_text()


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
        ({"domain": 'ex"ample.test'}, "domain with a quote"),
        ({"project_name": "My App (v2)"}, "project_name whose slugs aren't identifiers"),
        ({"project_name": "Test Project", "project_slug": "2fast"}, "project_slug starting with a digit"),
        ({"description": 'A "simple" app'}, "description with a double quote"),
    ],
)
def test_pre_gen_validation_rejects(cookies, override, reason):
    result = cookies.bake(extra_context={**load_context("default"), **override})
    assert result.exit_code != 0, f"expected rejection for {reason}"


def test_free_text_with_quotes_reaches_python_and_toml_intact(cookies):
    # tojson escaping: before it, a quote in any of these broke the hooks' own syntax.
    description = "A team's café & <app>"
    author_name = 'O\'Brien "Q" \\'
    result = cookies.bake(
        extra_context={**load_context("default"), "description": description, "author_name": author_name}
    )
    assert result.exit_code == 0, result.exception

    backend = result.project_path / result.context["project_slug"]
    pyproject = tomllib.loads((backend / "pyproject.toml").read_text())
    assert pyproject["project"]["description"] == description
    settings_py = (backend / result.context["project_slug"] / "settings.py").read_text()
    described = next(line for line in settings_py.splitlines() if '"DESCRIPTION":' in line)
    assert ast.literal_eval(described.split(":", 1)[1].strip().rstrip(",")) == description
    assert author_name in (result.project_path / "LICENSE").read_text()
    layout = result.project_path / f"{result.context['project_slug']}-frontend/apps/web/src/app/layout.tsx"
    assert f'  description: "{description}",' in layout.read_text()


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


@pytest.mark.parametrize(
    ("context_name", "storage_started"), [("default", True), ("self-tls", True), ("minimal", False)]
)
def test_object_storage_is_configured_everywhere_the_backend_runs(cookies, context_name, storage_started):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    prefix = result.context["config_prefix"]
    env_example = (result.project_path / ".env.example").read_text()
    for key in ("BUCKET_NAME", "ENDPOINT_URL", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "REGION_NAME"):
        assert (f"\n{prefix}__STORAGE__{key}=" in env_example) == storage_started
    # The suite writes to a real Garage, so every CI job that runs it has to start one.
    ci = (result.project_path / ".github" / "workflows" / "ci.yml").read_text()
    expected = ["database", *(["storage"] if storage_started else [])]
    if result.context["cache"] == "redis":
        expected.append("cache")
    started = [
        line.split("--wait-timeout 90 ", 1)[1].split() for line in ci.splitlines() if "--wait-timeout 90 " in line
    ]
    assert started == [expected, expected]


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
    # Every interface already: there is no load balancer to pick an address for.
    assert "__HTTP_BIND" not in env_example
    # nginx is the edge, so its own scheme is the truth. Pages, static files and the backend.
    assert nginx_conf.count("proxy_set_header X-Forwarded-Proto $scheme;") == 3
    assert "$http_x_forwarded_proto" not in nginx_conf
    # The placeholder lives outside certbot's live directory, which certbot refuses to issue into otherwise.
    certificate_sh = (result.project_path / server_dir / "certificate.sh").read_text()
    assert "/etc/letsencrypt/live" not in nginx_conf
    assert nginx_conf.count("ssl_certificate /etc/nginx/certificate/fullchain.pem;") == 2
    assert "PLACEHOLDER_DIR=/etc/nginx/placeholder-cert" in certificate_sh
    assert "/server/certificate.sh" in (result.project_path / server_dir / "entrypoint.sh").read_text()


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
    assert f"\n#{result.context['config_prefix']}__HTTP_BIND=\n" in env_example
    assert not (result.project_path / server_dir / "certificate.sh").exists()
    # The load balancer terminated TLS, so nginx's own $scheme is always http: its header is forwarded instead.
    assert "map $http_x_forwarded_proto $forwarded_proto {" in nginx_conf
    # The frontend's pages, its static files and the backend.
    assert nginx_conf.count("proxy_set_header X-Forwarded-Proto $forwarded_proto;") == 3
    assert "X-Forwarded-Proto $scheme" not in nginx_conf


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
    compose = (result.project_path / "docker-compose.yml").read_text()
    entrypoint = (result.project_path / f"{result.context['project_slug']}-server" / "entrypoint.sh").read_text()
    env_example = (result.project_path / ".env.example").read_text().splitlines()
    setup_sh = (result.project_path / "scripts" / "setup.sh").read_text()

    # nginx works the client out, once, and tells the backend (apps/common/client_ip.py).
    assert "TRUSTED_PROXY_COUNT" not in config_py
    assert f"{prefix}__TRUSTED_PROXY_COUNT: ${{{prefix}__TRUSTED_PROXY_COUNT:-{default_count}}}" in compose
    assert f'__TRUSTED_PROXY_COUNT" || echo {default_count})' in entrypoint
    assert env_example_line.format(prefix=prefix) in env_example
    assert ('set_var "${PREFIX}__TRUSTED_PROXY_COUNT"' in setup_sh) is setup_writes_count


def test_credential_key_is_documented_and_generated_for_a_deployment(cookies):
    # Optional locally (an EncryptedField just refuses to store), but setup.sh mints one for a deployment.
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
    # The audit logger's LOGGING entry is matched by name; a mismatch would leave it propagating.
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


@pytest.mark.parametrize(("context_name", "union"), [("default", '"en" | "tr"'), ("minimal", '"en"')])
def test_the_generated_api_client_carries_the_languages_answer(cookies, context_name, union):
    # The language enum is the one place the generated schema.ts depends on an answer.
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


@pytest.mark.parametrize("context_name", ["default", "minimal"])
def test_every_verified_by_names_a_test_file_the_bake_ships(cookies, context_name):
    # A `verified_by` exempts its mutant from the re-run, so a missing test file would check nothing.
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
    # Present so the README's step never hits "no such file", but it refuses.
    proc = subprocess.run(["bash", "scripts/dev-tls.sh"], cwd=result.project_path, capture_output=True, text=True)
    assert proc.returncode == 1
    assert "already serves https" in proc.stderr


def test_uwsgi_stops_on_sigterm_and_names_its_worker_count_once(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    ini = (result.project_path / result.context["project_slug"] / "uwsgi.ini").read_text()
    keys = [line.split("=", 1)[0].strip() for line in ini.splitlines() if "=" in line and not line.startswith(";")]

    # Without it uWSGI 2.0 reads `docker stop`'s SIGTERM as a reload.
    assert "die-on-term" in keys
    # `workers` is an alias of `processes`, so two of them leave one silently overriding the other.
    assert [key for key in keys if key in ("processes", "workers")] == ["processes"]
    assert "harakiri" in keys


def test_the_backend_venv_lives_outside_the_bind_mounted_source(cookies):
    """Compose re-attaches anonymous volumes, so a venv in one hides the rebuilt image's dependencies."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    compose = yaml.safe_load((result.project_path / "docker-compose.yml").read_text())
    mounts = [volume for service in compose["services"].values() for volume in service.get("volumes", [])]
    assert not [volume for volume in mounts if ".venv" in volume]

    dockerfile = (result.project_path / result.context["project_slug"] / "Dockerfile").read_text()
    assert "ENV UV_PROJECT_ENVIRONMENT=/venv" in dockerfile
    assert 'ENV PATH="/venv/bin:$PATH"' in dockerfile
