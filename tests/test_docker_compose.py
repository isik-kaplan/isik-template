import json
import os
import shutil
import subprocess

import pytest
from conftest import load_context


pytestmark = [
    pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available"),
    # Only `docker compose config` here - no image is ever built, so there's nothing for a real
    # install to do (see conftest.py's skip_lockfile_generation).
    pytest.mark.usefixtures("skip_lockfile_generation"),
]


@pytest.mark.parametrize("context_name", ["default", "self-tls"])
def test_docker_compose_config_validates(cookies, context_name):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "config", "--quiet"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr


def test_docker_compose_config_validates_with_the_local_https_override(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.dev-tls.yml", "config"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert 'published: "443"' in proc.stdout


def test_object_storage_is_a_pinned_s3_only_localstack_the_backend_waits_for(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
        check=True,
    )
    services = json.loads(proc.stdout)["services"]
    storage = services["storage"]
    # Every release from 2026.03.0 on needs an account and auth token just to start.
    assert storage["image"] == "localstack/localstack:4.14.0"
    assert storage["environment"]["SERVICES"] == "s3"
    assert not any("docker.sock" in str(volume) for volume in storage.get("volumes", []))
    assert [port["host_ip"] for port in storage["ports"]] == ["127.0.0.1"]
    assert services["backend"]["depends_on"]["storage"]["condition"] == "service_healthy"


def test_localstack_provisions_the_bucket_the_backend_is_configured_with(cookies):
    """The app holds no s3:CreateBucket, so the storage service makes the bucket itself, and is healthy
    only once that bucket exists."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0
    shutil.copy(result.project_path / ".env.example", result.project_path / ".env")

    proc = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
        check=True,
    )
    storage = json.loads(proc.stdout)["services"]["storage"]
    hook = result.project_path / "localstack" / "init" / "ready.d" / "create-bucket.sh"

    assert storage["environment"]["BUCKET_NAME"] == "test-project"
    assert storage["environment"]["REGION_NAME"] == "us-east-1"
    assert [volume["target"] for volume in storage["volumes"]] == ["/etc/localstack/init"]
    assert "head-bucket" in " ".join(storage["healthcheck"]["test"])
    assert hook.stat().st_mode & 0o111


def test_frontend_suites_run_in_the_dockerfile_tester_stage_only_on_request(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    def services(*profile):
        proc = subprocess.run(
            ["docker", "compose", *profile, "config", "--format", "json"],
            cwd=result.project_path,
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(proc.stdout)["services"]

    # Profiled, so a plain `docker compose up` never starts a one-shot test run.
    assert "frontend-test" not in services()
    frontend_test = services("--profile", "test")["frontend-test"]
    assert frontend_test["build"]["target"] == "tester"
    assert frontend_test["build"]["dockerfile"] == "apps/web/Dockerfile"
    assert {volume["target"] for volume in frontend_test["volumes"]} >= {"/repo", "/repo/node_modules"}


def test_compose_project_name_prefixes_every_resource(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "config"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
        check=True,
    )
    repo_slug = result.context["repo_slug"]
    assert f"name: {repo_slug}" in proc.stdout
    for resource in ("_internal", "_external", "_postgres_data"):
        assert f"{repo_slug}{resource}" in proc.stdout


def test_e2e_stack_adds_a_self_signed_https_listener_for_passkeys(cookies):
    """WebAuthn exists only in a secure context, so the e2e stack serves https beside http - and the
    frontend's server-side fetches, which follow the page's scheme, have to trust that certificate."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=result.project_path / "e2e",
        capture_output=True,
        text=True,
        check=True,
    )
    services = json.loads(proc.stdout)["services"]
    server = services["server"]
    assert "/etc/nginx/extra-listen/tls.conf" in [volume["target"] for volume in server["volumes"]]
    assert server["depends_on"]["e2e-certs"]["condition"] == "service_completed_successfully"
    assert services["frontend"]["environment"]["NODE_EXTRA_CA_CERTS"] == "/certs/cert.pem"
    nginx = (result.project_path / f"{result.context['project_slug']}-server" / "template.nginx.conf").read_text()
    assert nginx.count("include /etc/nginx/extra-listen/*.conf;") == 2


@pytest.mark.parametrize("context_name", ["default", "self-tls"])
def test_only_the_backend_services_receive_the_backends_secrets(cookies, context_name):
    """The public Node process, nginx, Postgres and RabbitMQ get what they read, never the whole .env."""
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
        check=True,
    )
    services = json.loads(proc.stdout)["services"]
    prefix = result.context["config_prefix"]
    secrets = {f"{prefix}__SECRET_KEY", f"{prefix}__CREDENTIAL_KEY", f"{prefix}__SETUP__SUPERUSER__PASSWORD"}
    for name in ("frontend", "server", "database", "broker"):
        assert "env_file" not in services[name], name
        assert not secrets & set(services[name].get("environment", {})), name
    assert services["frontend"]["environment"][f"{prefix}__DOMAIN"] == result.context["domain"]
    assert services["server"]["environment"] == {f"{prefix}__DOMAIN": result.context["domain"]}
    for name in ("backend", "worker", "scheduler"):
        assert f"{prefix}__SECRET_KEY" in services[name]["environment"], name


def test_e2e_tls_proxy_override_fronts_every_name_the_browser_uses(cookies):
    """The external-mode variant: a TLS-terminating proxy in front of nginx, as in production, with dnsmasq sending
    the browser to it instead of to nginx."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0
    e2e_path = result.project_path / "e2e"
    compose_file = next(
        line.removeprefix("COMPOSE_FILE=")
        for line in (e2e_path / ".env").read_text().splitlines()
        if line.startswith("COMPOSE_FILE=")
    )

    proc = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=e2e_path,
        env={**os.environ, "COMPOSE_FILE": f"{compose_file}:docker-compose.tls-proxy-for-e2e.yml"},
        capture_output=True,
        text=True,
        check=True,
    )
    services = json.loads(proc.stdout)["services"]
    proxy_ip = services["tls-proxy"]["networks"]["internal"]["ipv4_address"]
    assert f"--address=/{result.context['domain']}/{proxy_ip}" in services["dns"]["command"]
    assert services["tls-proxy"]["depends_on"]["server"]["condition"] == "service_healthy"
    assert "proxy_set_header X-Forwarded-Proto $scheme;" in (e2e_path / "tls-proxy.conf").read_text()


def test_self_tls_bakes_no_tls_proxy_override(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0

    assert not (result.project_path / "e2e" / "docker-compose.tls-proxy-for-e2e.yml").exists()
    assert not (result.project_path / "e2e" / "tls-proxy.conf").exists()
    assert "tls-proxy" not in (result.project_path / ".github" / "workflows" / "ci.yml").read_text()


@pytest.mark.parametrize(("bind", "host_ip"), [(None, "127.0.0.1"), ("10.0.0.5", "10.0.0.5")])
def test_external_tls_nginx_binds_to_loopback_unless_told_otherwise(cookies, bind, host_ip):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    env = {key: value for key, value in os.environ.items() if not key.endswith("__HTTP_BIND")}
    if bind is not None:
        env[f"{result.context['config_prefix']}__HTTP_BIND"] = bind
    proc = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
        check=True,
        env=env,
    )
    server = json.loads(proc.stdout)["services"]["server"]
    assert [(port["host_ip"], port["published"]) for port in server["ports"]] == [(host_ip, "80")]
