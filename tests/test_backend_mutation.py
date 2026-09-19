import os
import shutil
import subprocess

import pytest
from conftest import load_context


pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")


def _compose(project_path, *args, check=False):
    return subprocess.run(
        ["docker", "compose", *args],
        cwd=project_path,
        capture_output=True,
        text=True,
        check=check,
    )


def _reclaim_ownership(project_path):
    """The backend image has no USER, so mutmut/pytest write the bind-mounted bake directory as
    root. pytest-cookies' own teardown then can't remove it as the CI runner's unprivileged user -
    a throwaway container chowns it back before that teardown runs."""
    owner = f"{os.getuid()}:{os.getgid()}"
    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{project_path}:/x", "alpine", "chown", "-R", owner, "/x"],
        capture_output=True,
    )


def test_backend_mutation_pipeline_finds_no_survivors(cookies):
    """Proves the generated project's own backend-mutation CI job actually works, the same way
    test_backend_build.py proves the coverage suite does - baking a project and exercising it is not
    enough on its own, since none of the other bake tests run mutmut at all. Runs the identical
    commands that job runs (template clone, tree build, phase one, phase two, the final gate), not a
    parsed copy of its YAML - a scripts/ change that broke one but not the other would otherwise ship
    unnoticed until it broke the exact job whose commands this mirrors by hand.
    """
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0
    project_path = result.project_path
    project_slug = result.context["project_slug"]
    project_dir = project_path / project_slug

    try:
        build = _compose(project_path, "build", "backend")
        assert build.returncode == 0, build.stderr

        up = _compose(project_path, "up", "-d", "--wait", "--wait-timeout", "60", "database")
        assert up.returncode == 0, up.stderr

        migrate = _compose(project_path, "run", "--rm", "--no-deps", "backend", "python", "manage.py", "migrate")
        assert migrate.returncode == 0, migrate.stderr

        built = _compose(project_path, "run", "--rm", "backend", "python", "scripts/mutation_template.py", "build")
        assert built.returncode == 0, built.stdout + built.stderr

        checked = _compose(project_path, "run", "--rm", "backend", "python", "scripts/mutation_template.py", "check")
        assert checked.returncode == 0, checked.stdout + checked.stderr

        named = _compose(
            project_path, "run", "--rm", "--no-deps", "-T", "backend", "python", "scripts/mutation_template.py", "name"
        )
        assert named.returncode == 0, named.stdout + named.stderr
        template = named.stdout.strip().splitlines()[-1].strip()
        assert template, "the template name came back empty"

        tree = _compose(
            project_path, "run", "--rm", "--no-deps", "backend", "python", "scripts/mutation_run.py", "--build-tree"
        )
        assert tree.returncode == 0, tree.stdout + tree.stderr

        # The one clean pass mutation_run.py's own hashing cannot stand in for - see its docstring.
        # PY_IGNORE_IMPORTMISMATCH: pytest-django's project auto-discovery re-adds the checkout's root
        # to sys.path underneath mutants/, which only ever collides on the settings module.
        clean_pass = _compose(
            project_path,
            "run",
            "--rm",
            "-w",
            f"/{project_slug}/mutants",
            "-e",
            "MUTMUT_DB_SUFFIX=cleanpass",
            "-e",
            f"MUTMUT_DB_TEMPLATE={template}",
            "-e",
            "PY_IGNORE_IMPORTMISMATCH=1",
            "backend",
            "python",
            "-m",
            "pytest",
            "--no-cov",
        )
        assert clean_pass.returncode == 0, clean_pass.stdout + clean_pass.stderr

        # Named rather than bare, so the exemption registry's mutants are skipped here - the re-check
        # below settles them separately, without this test failing on what it finds there.
        queued = _compose(
            project_path, "run", "--rm", "--no-deps", "backend", "python", "-m", "scripts.mutation_queue", "--run"
        )
        assert queued.returncode == 0, queued.stdout + queued.stderr
        queue = [line for line in queued.stdout.splitlines() if line.strip()]
        (project_dir / "queue.txt").write_text("\n".join(queue) + ("\n" if queue else ""))

        if queue:
            phase_one = _compose(
                project_path,
                "run",
                "--rm",
                "-e",
                "MUTMUT_DB_SUFFIX=phaseone",
                "-e",
                f"MUTMUT_DB_TEMPLATE={template}",
                "backend",
                "sh",
                "-c",
                'xargs -d "\n" python scripts/mutation_run.py --max-children 1 < queue.txt',
            )
            assert phase_one.returncode == 0, phase_one.stdout + phase_one.stderr

        exported = _compose(
            project_path, "run", "--rm", "--no-deps", "backend", "python", "-m", "mutmut", "export-cicd-stats"
        )
        assert exported.returncode == 0, exported.stdout + exported.stderr

        # Non-blocking by design (phase two settles what phase one leaves alive) - only a stale tree
        # or a run that tested nothing fails here, both of which would otherwise report as a pass.
        phase_one_check = _compose(
            project_path, "run", "--rm", "--no-deps", "backend", "python", "-m", "scripts.check_mutants", "--phase-one"
        )
        assert phase_one_check.returncode == 0, phase_one_check.stdout + phase_one_check.stderr

        listed = _compose(project_path, "run", "--rm", "backend", "python", "-m", "mutmut", "results")
        assert listed.returncode == 0, listed.stdout + listed.stderr
        unsettled = [
            line.strip()
            for line in listed.stdout.splitlines()
            if line.strip().endswith((": survived", ": timeout", ": not checked"))
        ]
        (project_dir / "unsettled.txt").write_text("\n".join(unsettled) + ("\n" if unsettled else ""))

        phase_two = _compose(
            project_path,
            "run",
            "--rm",
            "-e",
            f"MUTMUT_DB_TEMPLATE={template}",
            "backend",
            "python",
            "-m",
            "scripts.confirm_survivors",
            "--queue",
            "unsettled.txt",
            "--jobs",
            "2",
        )
        assert phase_two.returncode == 0, phase_two.stdout + phase_two.stderr

        gate = _compose(
            project_path,
            "run",
            "--rm",
            "--no-deps",
            "backend",
            "python",
            "-m",
            "scripts.check_mutants",
            "--confirmed",
            "mutants/mutmut-confirmed.json",
            "--queue",
            "unsettled.txt",
        )
        assert gate.returncode == 0, gate.stdout + gate.stderr
        assert "no surviving mutants" in gate.stdout

        # A prompt to revisit an exemption, not this test's business - the mutation itself already
        # checked its own file's reasons and fingerprint, so a mismatch here means a real test now
        # covers what was recorded as unkillable, which is good news that still needs a human look.
        exempt = _compose(
            project_path, "run", "--rm", "--no-deps", "backend", "python", "-m", "scripts.mutation_queue", "--exempt"
        )
        assert exempt.returncode == 0, exempt.stdout + exempt.stderr
        exempted = [line for line in exempt.stdout.splitlines() if line.strip()]
        if exempted:
            (project_dir / "exempt.txt").write_text("\n".join(exempted) + "\n")
            recheck = _compose(
                project_path,
                "run",
                "--rm",
                "-e",
                "MUTMUT_DB_SUFFIX=recheck",
                "-e",
                f"MUTMUT_DB_TEMPLATE={template}",
                "backend",
                "sh",
                "-c",
                'xargs -d "\n" python scripts/mutation_run.py --max-children 1 < exempt.txt',
            )
            assert recheck.returncode == 0, recheck.stdout + recheck.stderr
            reresults = _compose(
                project_path, "run", "--rm", "--no-deps", "backend", "python", "-m", "mutmut", "results"
            )
            assert reresults.returncode == 0, reresults.stdout + reresults.stderr
            killed = [
                line
                for line in reresults.stdout.splitlines()
                if line.strip().endswith(": killed") and line.strip().rsplit(":", 1)[0].strip() in exempted
            ]
            assert not killed, f"exemption(s) no longer hold - a test now kills them: {killed}"
    finally:
        _compose(project_path, "down", "-v")
        _reclaim_ownership(project_path)
        subprocess.run(
            ["docker", "image", "rm", "-f", f"{result.context['repo_slug']}-backend:latest"],
            capture_output=True,
        )
