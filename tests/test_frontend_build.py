import shutil
import subprocess

import pytest
from conftest import load_context


pytestmark = pytest.mark.skipif(shutil.which("npm") is None, reason="npm not available")


def test_frontend_installs_lints_and_builds(cookies):
    """Slow (npm install + next build) - proves the frontend isn't just well-formed template
    output, but an actually-buildable Next.js app with clean lint/types."""
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0
    frontend_path = result.project_path / f"{result.context['project_slug']}-frontend"

    def run(*args):
        return subprocess.run(args, cwd=frontend_path, capture_output=True, text=True)

    install = run("npm", "install")
    assert install.returncode == 0, install.stderr

    build_packages = run("npm", "run", "build:packages")
    assert build_packages.returncode == 0, build_packages.stdout + build_packages.stderr

    lint = run("npx", "eslint", ".")
    assert lint.returncode == 0, lint.stdout + lint.stderr

    fmt = run("npx", "prettier", "--check", ".")
    assert fmt.returncode == 0, fmt.stdout + fmt.stderr

    types = run("npm", "run", "lint:types", "--workspace=web")
    assert types.returncode == 0, types.stdout + types.stderr

    build = run("npm", "run", "build", "--workspace=web")
    assert build.returncode == 0, build.stdout + build.stderr

    test = run("npm", "run", "test", "--workspace=web")
    assert test.returncode == 0, test.stdout + test.stderr
