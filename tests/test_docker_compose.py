import json
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
