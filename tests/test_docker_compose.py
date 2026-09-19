import shutil
import subprocess

import pytest
from conftest import load_context


pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")


def test_docker_compose_config_validates(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    proc = subprocess.run(
        ["docker", "compose", "config", "--quiet"],
        cwd=result.project_path,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stderr


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
