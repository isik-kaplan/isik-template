import subprocess
import zipfile
from pathlib import Path

from conftest import load_context
from cookiecutter.main import cookiecutter


ROOT = Path(__file__).parent.parent


def test_the_template_bakes_from_an_address_as_well_as_from_a_checkout(tmp_path, monkeypatch, skip_lockfile_generation):
    """A zip takes the path a gh: or git source does: the hooks see the address as typed, the files in a checkout."""
    listed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.splitlines()
    archive = tmp_path / "isik-template.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        # cookiecutter wants the top directory's own entry first.
        zipped.writestr("isik-template/", "")
        for name in listed:
            if (ROOT / name).is_file():
                zipped.write(ROOT / name, f"isik-template/{name}")
    # Unzipped into here rather than ~/.cookiecutters.
    config = tmp_path / "cookiecutter.yaml"
    config.write_text(f"cookiecutters_dir: {tmp_path / 'checkouts'}\nreplay_dir: {tmp_path / 'replay'}\n")
    monkeypatch.setenv("COOKIECUTTER_CONFIG", str(config))

    project = cookiecutter(
        str(archive), no_input=True, extra_context=load_context("minimal"), output_dir=str(tmp_path / "out")
    )

    assert (Path(project) / "README.md").is_file()
