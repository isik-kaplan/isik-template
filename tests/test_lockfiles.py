import shutil

import pytest
from conftest import load_context


# "minimal": no mobile workspace, fewer packages to resolve.
pytestmark = pytest.mark.skipif(
    shutil.which("uv") is None or shutil.which("npm") is None,
    reason="uv or npm not available",
)


def test_bake_generates_lock_files(cookies):
    result = cookies.bake(extra_context=load_context("minimal"))
    assert result.exit_code == 0

    project_slug = result.context["project_slug"]
    uv_lock = result.project_path / project_slug / "uv.lock"
    package_lock = result.project_path / f"{project_slug}-frontend" / "package-lock.json"

    assert uv_lock.is_file()
    assert package_lock.is_file()
