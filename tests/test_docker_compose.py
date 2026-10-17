import itertools
import json
import os
import shutil
import subprocess

import pytest
from conftest import PAIRWISE, load_context


pytestmark = [
    pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available"),
    # Only `docker compose config` here - no image is ever built, so there's nothing for a real
    # install to do (see conftest.py's skip_lockfile_generation).
    pytest.mark.usefixtures("skip_lockfile_generation"),
]


@pytest.mark.parametrize("context_name", ["default", "self-tls", "minimal"])
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


def _services(project_path, *args):
    shutil.copy(project_path / ".env.example", project_path / ".env")
    proc = subprocess.run(
        ["docker", "compose", *args, "config", "--format", "json"],
        cwd=project_path,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)["services"]


def test_bundled_garage_is_the_storage_the_backend_waits_for(cookies):
    """The app holds no s3:CreateBucket, so the storage service makes sure of the key and the bucket
    itself, and is healthy only once it has."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    services = _services(result.project_path)
    storage = services["storage"]
    prefix = result.context["config_prefix"]
    env_example = (result.project_path / ".env.example").read_text()

    assert "dxflrs/garage:" in (result.project_path / "storage" / "Dockerfile").read_text()
    assert (result.project_path / "storage" / "entrypoint.sh").stat().st_mode & 0o111
    assert storage["environment"]["BUCKET_NAME"] == "test-project"
    assert storage["environment"]["REGION_NAME"] == "us-east-1"
    assert [volume["target"] for volume in storage["volumes"]] == ["/var/lib/garage"]
    assert [port["host_ip"] for port in storage["ports"]] == ["127.0.0.1"]
    assert "/tmp/ready" in " ".join(storage["healthcheck"]["test"])
    assert "profiles" not in storage
    assert services["backend"]["depends_on"]["storage"]["condition"] == "service_healthy"
    assert services["backend"]["depends_on"]["storage"]["required"] is True
    assert "COMPOSE_PROFILES" not in env_example
    assert f"\n{prefix}__STORAGE__ENDPOINT_URL=http://storage:3900\n" in env_example


def test_an_external_provider_runs_garage_only_under_the_local_storage_profile(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0
    env_example = (result.project_path / ".env.example").read_text()

    assert "\nCOMPOSE_PROFILES=local-storage\n" in env_example
    assert _services(result.project_path)["storage"]["profiles"] == ["local-storage"]
    deployed = _services(result.project_path, "--env-file", "/dev/null")
    assert "storage" not in deployed
    assert deployed["backend"]["depends_on"]["storage"]["required"] is False


def test_disk_storage_runs_no_storage_service_and_mounts_a_media_volume(cookies):
    result = cookies.bake(extra_context=load_context("minimal"))
    assert result.exit_code == 0

    services = _services(result.project_path)
    assert "storage" not in services
    assert "storage" not in services["backend"].get("depends_on", {})
    assert {volume["target"] for volume in services["backend"]["volumes"]} >= {"/media"}
    assert not (result.project_path / "storage").exists()
    assert "STORAGE__" not in (result.project_path / ".env.example").read_text()
    media = [volume for volume in services["server"]["volumes"] if volume["target"] == "/media"]
    assert [(volume["source"], volume["read_only"]) for volume in media] == [("media", True)]


@pytest.mark.parametrize(
    ("context_name", "location", "absent"),
    [
        ("minimal", "location /internal/media/ {", "/internal/storage/"),
        ("default", "location = /internal/storage/ {", "/internal/media/"),
        ("self-tls", "location = /internal/storage/ {", "/internal/media/"),
    ],
)
def test_nginx_sends_stored_files_only_from_an_internal_location_on_the_backend_hosts(
    cookies, context_name, location, absent
):
    """serve_file() answers with an X-Accel-Redirect; these are the locations it names."""
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    nginx = (result.project_path / f"{result.context['project_slug']}-server" / "template.nginx.conf").read_text()

    [backend_block] = [block for block in nginx.split("server {") if "proxy_pass http://backend_api;" in block]
    found = backend_block.split(location, 1)[1].split("}", 1)[0]
    assert "internal;" in found
    assert "add_header Content-Security-Policy \"default-src 'none'; sandbox\" always;" in found
    assert "add_header X-Content-Type-Options nosniff always;" in found
    assert nginx.count(location) == 1
    assert absent not in nginx


@pytest.mark.parametrize("context_name", ["default", "self-tls", "minimal"])
def test_nginx_is_on_a_network_docker_publishes_ports_from(cookies, context_name):
    """Docker publishes nothing for a container whose every network is `internal`."""
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    server = _services(result.project_path)["server"]
    assert set(server["networks"]) == {"internal", "external"}
    assert server["ports"]


@pytest.mark.parametrize(
    ("context_name", "expected"),
    [
        ("default", {"broker", "worker", "scheduler"}),
        ("self-tls", {"broker", "worker"}),
        ("minimal", set()),
    ],
)
def test_background_jobs_decide_the_broker_worker_and_scheduler(cookies, context_name, expected):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    services = _services(result.project_path)
    assert {"broker", "worker", "scheduler"} & set(services) == expected
    assert ("broker" in services["backend"]["depends_on"]) == bool(expected)
    assert (result.project_path / "broker").exists() == bool(expected)
    assert ("BROKER__" in (result.project_path / ".env.example").read_text()) == bool(expected)


JOBS = {"celery-with-beat": {"broker", "worker", "scheduler"}, "celery": {"broker", "worker"}, "inline": set()}


def test_pairwise_meets_every_answer_with_every_other():
    answers = list(zip(*PAIRWISE, strict=True))
    for first, second in itertools.combinations(range(3), 2):
        wanted = set(itertools.product(set(answers[first]), set(answers[second])))
        assert {(row[first], row[second]) for row in PAIRWISE} == wanted
    assert [set(column) for column in answers] == [set(JOBS), {"garage", "s3", "disk"}, {"external", "self"}]


@pytest.mark.parametrize(("background_jobs", "storage", "tls_termination"), PAIRWISE)
def test_every_pair_of_answers_bakes_a_stack_that_holds_together(cookies, background_jobs, storage, tls_termination):
    """Config only: the answers that run code are tested for real by test_backend.py's contexts."""
    answers = {"background_jobs": background_jobs, "storage": storage, "tls_termination": tls_termination}
    result = cookies.bake(extra_context={**load_context("default"), **answers})
    assert result.exit_code == 0
    project_path = result.project_path

    services = _services(project_path)
    e2e = subprocess.run(
        ["docker", "compose", "config", "--quiet"], cwd=project_path / "e2e", capture_output=True, text=True
    )
    assert e2e.returncode == 0, e2e.stderr
    assert {"broker", "worker", "scheduler"} & set(services) == JOBS[background_jobs]
    assert ("storage" in services) == (storage != "disk")
    assert ("certbot" in services) == (tls_termination == "self")
    nginx = (project_path / f"{result.context['project_slug']}-server" / "template.nginx.conf").read_text()
    assert ("/internal/media/" in nginx) == (storage == "disk")
    assert ("/internal/storage/" in nginx) == (storage != "disk")


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
    for name in {"frontend", "server", "database", "broker", "storage"} & set(services):
        assert "env_file" not in services[name], name
        assert not secrets & set(services[name].get("environment", {})), name
    assert services["frontend"]["environment"][f"{prefix}__DOMAIN"] == result.context["domain"]
    assert services["server"]["environment"] == {f"{prefix}__DOMAIN": result.context["domain"]}
    for name in {"backend", "worker", "scheduler"} & set(services):
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
