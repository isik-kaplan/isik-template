import os
import shutil
import subprocess

import pytest
from conftest import load_context


# Every context the sandbox run doesn't bake; with "default" they cover every pair of service answers.
pytestmark = [
    pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available"),
    # Only the backend image is built, which needs uv.lock and not the frontend's npm install.
    pytest.mark.usefixtures("skip_lockfile_generation"),
]

CONTEXTS = ["minimal", "self-tls", "beat-disk-self-tls", "celery-disk", "inline-garage-self-tls"]


def _reclaim_ownership(project_path):
    """The backend image writes the bind-mounted bake as root, which pytest-cookies' teardown can't remove."""
    owner = f"{os.getuid()}:{os.getgid()}"
    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{project_path}:/x", "alpine", "chown", "-R", owner, "/x"],
        capture_output=True,
    )


@pytest.mark.parametrize("context_name", CONTEXTS)
def test_the_backend_suite_passes(cookies, context_name):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    project_path = result.project_path
    prefix = result.context["config_prefix"]
    subprocess.run(["uv", "lock"], cwd=project_path / result.context["project_slug"], check=True)
    shutil.copy(project_path / ".env.example", project_path / ".env")
    env = {**os.environ, "COMPOSE_PROJECT_NAME": f"{project_path.name}-backend"}

    def compose(*args):
        proc = subprocess.run(["docker", "compose", *args], cwd=project_path, env=env, capture_output=True, text=True)
        assert proc.returncode == 0, f"docker compose {' '.join(args)}\n{proc.stdout[-8000:]}\n{proc.stderr[-8000:]}"

    services = ["database"]
    if result.context["storage"] != "disk":
        services.append("storage")
    if result.context["cache"] == "redis":
        services.append("cache")
    try:
        compose("build", "backend")
        compose("up", "-d", "--wait", "--wait-timeout", "90", *services)
        compose("run", "--rm", "--no-deps", "backend", "python", "manage.py", "migrate")
        compose("run", "--rm", "--no-deps", "backend", "python", "manage.py", "makemigrations", "--check", "--dry-run")
        compose(
            "run", "--rm", "--no-deps", "-e", f"{prefix}__DEBUG=false", "backend",
            "python", "manage.py", "check", "--deploy", "--fail-level", "WARNING",
        )  # fmt: skip
        compose("run", "--rm", "--no-deps", "backend", "python", "-m", "pytest")
    finally:
        subprocess.run(["docker", "compose", "down", "-v"], cwd=project_path, env=env, capture_output=True)
        _reclaim_ownership(project_path)
