import shutil

import pytest
from conftest import load_context


# The one real (not skip_lockfile_generation'd) bake in the fast suite - proves
# hooks/post_gen_project.py's generate_lock_files() still resolves and writes both lock files,
# which is what lets both Dockerfiles use --frozen/npm ci instead of re-resolving dependencies on
# every build. "no-social-login" over "default": no mobile workspace, fewer packages to resolve.
pytestmark = pytest.mark.skipif(
    shutil.which("uv") is None or shutil.which("npm") is None,
    reason="uv or npm not available",
)


def test_bake_generates_lock_files(cookies):
    result = cookies.bake(extra_context=load_context("no-social-login"))
    assert result.exit_code == 0

    project_slug = result.context["project_slug"]
    uv_lock = result.project_path / project_slug / "uv.lock"
    package_lock = result.project_path / f"{project_slug}-frontend" / "package-lock.json"

    assert uv_lock.is_file()
    assert package_lock.is_file()
