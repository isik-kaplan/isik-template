import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest
from conftest import load_context


# Boots a self-mode bake's nginx and certbot against Pebble, Let's Encrypt's test ACME server: the one place the
# certificate path runs for real. Only the server image is built, so no lockfile is needed.
pytestmark = [
    pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available"),
    pytest.mark.usefixtures("skip_lockfile_generation"),
]

PEBBLE_FIXTURES = Path(__file__).parent / "pebble"


def _compose(project_path, env, *args):
    return subprocess.run(
        ["docker", "compose", *args], cwd=project_path, env=env, capture_output=True, text=True, check=False
    )


def _served_certificate(project_path, env, domain):
    """The issuer and serial nginx presents for the domain, read off a real handshake."""
    handshake = (
        f"openssl s_client -connect 127.0.0.1:443 -servername {domain} </dev/null 2>/dev/null"
        " | openssl x509 -noout -issuer -serial"
    )
    return _compose(project_path, env, "exec", "-T", "server", "sh", "-c", handshake).stdout


def _wait_for(predicate, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(3)
    return False


def test_self_tls_serves_a_pebble_issued_certificate_and_keeps_serving_one_after_a_forced_renew(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0
    project_path = result.project_path
    domain = result.context["domain"]
    shutil.copytree(PEBBLE_FIXTURES, project_path / "pebble")
    shutil.copy(project_path / ".env.example", project_path / ".env")
    env = {
        **os.environ,
        "COMPOSE_PROJECT_NAME": f"{os.environ.get('COMPOSE_PROJECT_NAME', project_path.name)}-pebble",
        "COMPOSE_FILE": "docker-compose.yml:pebble/docker-compose.pebble.yml",
        "PEBBLE_DOMAIN": domain,
    }

    def diagnostics():
        return _compose(project_path, env, "logs", "--no-color", "certbot", "server").stdout[-8000:]

    try:
        for step in (
            ("build", "server"),
            ("run", "--rm", "pebble-certs"),
            # --no-deps: the backend and frontend play no part in getting a certificate.
            ("up", "-d", "--no-deps", "--wait", "pebble", "upstreams", "server"),
            ("up", "-d", "--no-deps", "certbot"),
        ):
            proc = _compose(project_path, env, *step)
            assert proc.returncode == 0, f"{step}: {proc.stderr}"

        # Through the generated entrypoint's own polling, which picks up the first issuance within a minute.
        issued = _wait_for(lambda: "Pebble" in _served_certificate(project_path, env, domain), timeout=150)
        assert issued, f"served: {_served_certificate(project_path, env, domain)!r}\n{diagnostics()}"
        first = _served_certificate(project_path, env, domain)

        renew = _compose(project_path, env, "exec", "-T", "certbot", "certbot", "renew", "--force-renewal")
        assert renew.returncode == 0, renew.stdout + renew.stderr
        # Stands in for the entrypoint's 12-hourly reload, which is what picks up a renewal.
        reload = _compose(project_path, env, "exec", "-T", "server", "nginx", "-s", "reload")
        assert reload.returncode == 0, reload.stderr

        def renewed():
            served = _served_certificate(project_path, env, domain)
            return "Pebble" in served and served != first

        assert _wait_for(renewed, timeout=30), f"still served: {first!r}\n{diagnostics()}"
    finally:
        _compose(project_path, env, "down", "-v")
