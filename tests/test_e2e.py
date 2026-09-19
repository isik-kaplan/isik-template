import os
import shutil
import subprocess

import pytest
from conftest import load_context


# Not opt-in: bakes a project, builds every image, boots the full compose stack (database, broker,
# backend, worker, scheduler, frontend, server, dns, mailpit, authentik, playwright) and runs every
# auth spec - including social login - against real containers. Several minutes, unlike the rest of
# this suite, but this is the one test that has caught every real bug this template has shipped
# (CORS, key-encoding, 401-as-success, a hardcoded config prefix, a missing pyjwt dependency, an
# infinite redirect loop) - none of them visible to a faster tier. Skips only if docker itself isn't
# available, same as the build tests.
pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")


def _compose(e2e_path, *args, check=False):
    return subprocess.run(["docker", "compose", *args], cwd=e2e_path, capture_output=True, text=True, check=check)


def _reclaim_ownership(project_path):
    """Several images here have no USER, so they write the bind-mounted bake directory as root.
    pytest-cookies' own teardown then can't remove it as the CI runner's unprivileged user - a
    throwaway container chowns it back before that teardown runs."""
    owner = f"{os.getuid()}:{os.getgid()}"
    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{project_path}:/x", "alpine", "chown", "-R", owner, "/x"],
        capture_output=True,
    )


@pytest.mark.parametrize("context_name", ["default", "no-social-login"])
def test_generated_project_passes_its_own_e2e_suite(cookies, context_name):
    """The one test that proves the auth flows the template ships (signup, verify-email, login,
    logout, password reset) actually work end to end in a browser, not just that the code compiles
    - this is exactly the suite that first caught the CORS/CSRF/key-encoding bugs this template
    used to ship with. Parametrized over no-social-login too: that config renders a different
    login/signup page (no provider buttons, no divider above the form) that "default" never
    exercises here - it's how a bare "or" divider with nothing above it once shipped unnoticed."""
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    e2e_path = result.project_path / "e2e"

    try:
        # Split rather than `up -d --build`: worker/scheduler share backend's image tag with no
        # build of their own, and starting them before that build finishes tagging the image can
        # race compose into pulling it instead of using what was just built.
        build = _compose(e2e_path, "build")
        assert build.returncode == 0, build.stderr

        up = _compose(e2e_path, "up", "-d")
        if up.returncode != 0:
            # A service failing its own healthcheck reports only "unhealthy" here - the reason
            # lives in that service's own log, which `up` never prints. Pulled into the failure
            # message directly, since a CI run's only record of this is what pytest captured.
            # `up` failing on one dependency leaves every container it already started running
            # (nothing here tears down on its own), so the exact healthcheck command still runs
            # against a live target - closer to the truth than reasoning about the log alone.
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

        run = _compose(e2e_path, "run", "--rm", "playwright", "npx", "playwright", "test", "--reporter=list")
        assert run.returncode == 0, run.stdout + run.stderr
    finally:
        _compose(e2e_path, "down", "-v")
        _reclaim_ownership(result.project_path)
