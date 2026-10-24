import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from conftest import load_context


# Slow but not opt-in: the full stack in a browser has caught bugs no faster tier saw.
pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")

LEGAL_FIXTURES = Path(__file__).parent / "fixtures" / "legal"


def _compose(e2e_path, *args, check=False):
    return subprocess.run(["docker", "compose", *args], cwd=e2e_path, capture_output=True, text=True, check=check)


def _reclaim_ownership(project_path):
    """Images without a USER write the bind-mounted bake as root, which pytest-cookies' teardown can't remove."""
    owner = f"{os.getuid()}:{os.getgid()}"
    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{project_path}:/x", "alpine", "chown", "-R", owner, "/x"],
        capture_output=True,
    )


def _publish_fixture_legal_documents(project_path, project_slug):
    """A bake ships no legal text; without these the legal specs only see the not-added-yet state."""
    shutil.copytree(LEGAL_FIXTURES, project_path / f"{project_slug}-frontend/apps/web/src/legal", dirs_exist_ok=True)
    # Exits 1 for "rewritten", which is the point here.
    subprocess.run([sys.executable, "scripts/pre-commit/legal_version.py"], cwd=project_path, capture_output=True)


def _switch_social_login_off(project_path):
    """With no provider named, the OIDC specs skip themselves."""
    env = project_path / "e2e" / ".env"
    text = env.read_text()
    line = next(line for line in text.splitlines() if line.endswith("__SOCIAL_LOGIN__PROVIDERS=openid_connect"))
    env.write_text(text.replace(line, line.removesuffix("openid_connect")))


def test_generated_project_passes_its_own_e2e_suite(cookies):
    """Social login off: the login page without provider buttons is never exercised by the generated CI."""
    result = cookies.bake(extra_context=load_context("minimal"))
    assert result.exit_code == 0
    _publish_fixture_legal_documents(result.project_path, result.context["project_slug"])
    _switch_social_login_off(result.project_path)
    e2e_path = result.project_path / "e2e"

    try:
        # Not `up -d --build`: worker/scheduler share backend's tag and could race into pulling it.
        build = _compose(e2e_path, "build")
        assert build.returncode == 0, build.stderr

        up = _compose(e2e_path, "up", "-d")
        if up.returncode != 0:
            # `up` only says "unhealthy"; the containers are still running, so rerun the healthcheck for its output.
            probe_command = [
                "docker",
                "compose",
                "exec",
                "-T",
                "authentik-server",
                "/ak-root/.venv/bin/python3",
                "-c",
                "import urllib.request; urllib.request.urlopen('http://localhost:9000/-/health/live/', timeout=3)",
            ]
            probe = subprocess.run(probe_command, cwd=e2e_path, capture_output=True, text=True)
            logs = _compose(e2e_path, "logs", "--no-color").stdout
            pytest.fail(
                f"{up.stderr}\n\n--- healthcheck's own command, run directly ---\n"
                f"exit {probe.returncode}\n{probe.stdout}\n{probe.stderr}\n\n"
                f"--- docker compose logs (tail) ---\n{logs[-8000:]}"
            )

        # `build` above skips this service; without --build a rerun would use stale specs.
        run = _compose(e2e_path, "run", "--build", "--rm", "playwright", "npx", "playwright", "test", "--reporter=list")
        assert run.returncode == 0, run.stdout + run.stderr
    finally:
        _compose(e2e_path, "down", "-v")
        _reclaim_ownership(result.project_path)
