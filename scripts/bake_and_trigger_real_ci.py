"""Bakes the template and force-pushes the result to a dedicated sandbox repo, then waits for that
repo's own GitHub Actions to run the generated project's real ci.yml - the one thing no hand-mirrored
bake test can prove, since those replay commands by hand instead of letting a real runner parse the
real workflow file.

`GH_TOKEN` must carry a PAT scoped to the sandbox repo (the default GITHUB_TOKEN is deliberately
blocked by GitHub from triggering new workflow runs on push, to prevent recursive workflows) - both
for the push itself and for every `gh` call below, which is why this never calls `gh auth login`.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from cookiecutter.main import cookiecutter


SANDBOX_REPO = "isik-kaplan/isik-template-bake-sandbox"
TEMPLATE_ROOT = Path(__file__).parent.parent
RUN_POLL_INTERVAL = 20
APPEAR_TIMEOUT = 150


def load_context(name):
    return json.loads((TEMPLATE_ROOT / "tests" / "contexts" / f"{name}.json").read_text())


def bake_and_push(token):
    with tempfile.TemporaryDirectory() as tmp:
        project_path = Path(
            cookiecutter(
                str(TEMPLATE_ROOT),
                no_input=True,
                extra_context=load_context("default"),
                output_dir=tmp,
            )
        )
        source_sha = os.environ.get("GITHUB_SHA", "local")

        subprocess.run(["git", "init", "-q", "-b", "master"], cwd=project_path, check=True)
        subprocess.run(["git", "add", "-A"], cwd=project_path, check=True)
        subprocess.run(
            [
                "git",
                "-c",
                "user.name=isik-template bake",
                "-c",
                "user.email=bake@isik-template.invalid",
                "commit",
                "-q",
                "--no-verify",  # machine-generated fixture output, not an authored commit -
                # the global commit-msg hook enforces conventions meant for the latter.
                "-m",
                f"Bake output for CI verification (source commit {source_sha})",
            ],
            cwd=project_path,
            check=True,
        )
        push_sha = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=project_path, capture_output=True, text=True, check=True
        ).stdout.strip()

        remote = f"https://x-access-token:{token}@github.com/{SANDBOX_REPO}.git"
        # No secrets in the failure path: a failed push prints argv, and argv here never contains
        # the token - it's baked into a URL that's passed as a single arg, not echoed by git itself.
        subprocess.run(["git", "push", "--force", "--quiet", remote, "HEAD:master"], cwd=project_path, check=True)

    return push_sha


def find_run(push_sha):
    deadline = time.monotonic() + APPEAR_TIMEOUT
    while time.monotonic() < deadline:
        result = subprocess.run(
            ["gh", "run", "list", "--repo", SANDBOX_REPO, "--json", "databaseId,headSha", "-L", "20"],
            capture_output=True,
            text=True,
            check=True,
        )
        for run in json.loads(result.stdout):
            if run["headSha"] == push_sha:
                return run["databaseId"]
        time.sleep(5)
    return None


def wait_for_completion(run_id):
    while True:
        result = subprocess.run(
            ["gh", "run", "view", str(run_id), "--repo", SANDBOX_REPO, "--json", "status,conclusion"],
            capture_output=True,
            text=True,
            check=True,
        )
        state = json.loads(result.stdout)
        if state["status"] == "completed":
            return state["conclusion"]
        time.sleep(RUN_POLL_INTERVAL)


def main():
    token = os.environ.get("BAKE_SANDBOX_TOKEN")
    if not token:
        print(
            "BAKE_SANDBOX_TOKEN is not set - this job needs a PAT scoped to "
            f"{SANDBOX_REPO} (the default GITHUB_TOKEN cannot trigger workflow runs there). "
            "Create one and run: gh secret set BAKE_SANDBOX_TOKEN --repo isik-kaplan/isik-template",
            file=sys.stderr,
        )
        sys.exit(1)

    push_sha = bake_and_push(token)

    run_id = find_run(push_sha)
    if run_id is None:
        print(f"no workflow run appeared for {push_sha} in {SANDBOX_REPO} within {APPEAR_TIMEOUT}s", file=sys.stderr)
        sys.exit(1)

    run_url = f"https://github.com/{SANDBOX_REPO}/actions/runs/{run_id}"
    print(f"watching {run_url}")
    conclusion = wait_for_completion(run_id)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as f:
            f.write(f"Generated project's real CI run: [{conclusion}]({run_url})\n")

    if conclusion != "success":
        print(f"generated project's real CI did not pass: {run_url} ({conclusion})", file=sys.stderr)
        sys.exit(1)

    print(f"generated project's real CI passed: {run_url}")


if __name__ == "__main__":
    main()
