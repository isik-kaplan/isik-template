import os
import shutil
import subprocess

import pytest
from conftest import load_context


pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")


def _compose(project_path, *args, check=True):
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=project_path,
        capture_output=True,
        text=True,
        check=check,
    )


def _reclaim_ownership(project_path):
    """The backend image has no USER, so pytest/coverage/Hypothesis write the bind-mounted bake
    directory as root. pytest-cookies' own teardown then can't remove it as the CI runner's
    unprivileged user - a throwaway container chowns it back before that teardown runs."""
    owner = f"{os.getuid()}:{os.getgid()}"
    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{project_path}:/x", "alpine", "chown", "-R", owner, "/x"],
        capture_output=True,
    )


def test_backend_builds_migrates_and_passes_its_own_tests(cookies):
    """Slow (image build + real Postgres) - this is the one test that proves the backend isn't
    just well-formed template output, but an actually-working Django project."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0
    project_path = result.project_path

    try:
        build = _compose(project_path, "build", "backend", check=False)
        assert build.returncode == 0, build.stderr

        up = _compose(project_path, "up", "-d", "database", check=False)
        assert up.returncode == 0, up.stderr

        healthy = subprocess.run(
            [
                "docker",
                "compose",
                "up",
                "-d",
                "--wait",
                "--wait-timeout",
                "60",
                "database",
            ],
            cwd=project_path,
            capture_output=True,
            text=True,
        )
        assert healthy.returncode == 0, healthy.stderr

        migrate = _compose(
            project_path, "run", "--rm", "--no-deps", "backend", "python", "manage.py", "migrate", check=False
        )
        assert migrate.returncode == 0, migrate.stderr

        test = _compose(project_path, "run", "--rm", "--no-deps", "backend", "python", "-m", "pytest", check=False)
        assert test.returncode == 0, test.stdout + test.stderr
        assert "Required test coverage of 100.0% reached" in test.stdout
    finally:
        _compose(project_path, "down", "-v", check=False)
        _reclaim_ownership(project_path)
        subprocess.run(
            ["docker", "image", "rm", "-f", f"{result.context['repo_slug']}-backend:latest"],
            capture_output=True,
        )
