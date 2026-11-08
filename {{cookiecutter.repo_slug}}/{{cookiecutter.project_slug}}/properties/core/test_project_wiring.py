"""The project's own wiring: provider credentials read from the environment, a task's build stamp, and the
admin host's routes."""

from django.urls import resolve
from hypothesis import given
from hypothesis import strategies as st

from {{ cookiecutter.project_slug }} import __version__
from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask
from {{ cookiecutter.project_slug }}.config import CONFIG
from {{ cookiecutter.project_slug }}.settings import _social_app_config


PROVIDER = st.sampled_from(["google", "github", "openid_connect", "microsoft"])
ENV = st.none() | st.text(st.characters(codec="ascii", categories=["L", "N"]), max_size=10)


@given(provider=PROVIDER, client_id=ENV, secret=ENV, provider_id=ENV, server_url=ENV)
def test_a_providers_app_is_read_from_its_own_environment_keys(
    monkeypatch, provider, client_id, secret, provider_id, server_url
):
    prefix = f"{{ cookiecutter.config_prefix }}__OAUTH__{provider.upper()}"
    with monkeypatch.context() as patched:
        for name, value in [
            ("CLIENT_ID", client_id),
            ("CLIENT_SECRET", secret),
            ("PROVIDER_ID", provider_id),
            ("SERVER_URL", server_url),
        ]:
            if value is None:
                patched.delenv(f"{prefix}__{name}", raising=False)
            else:
                patched.setenv(f"{prefix}__{name}", value)

        config = _social_app_config(provider)

    assert (config["client_id"], config["secret"], config["key"]) == (client_id or "", secret or "", "")
    if provider == "openid_connect":
        expected_id = "openid_connect" if provider_id is None else provider_id
        assert config["provider_id"] == expected_id
        assert config["settings"] == {"server_url": server_url or ""}
    else:
        assert set(config) == {"client_id", "secret", "key"}


@given(name=st.from_regex(r"[a-z_]{1,12}", fullmatch=True))
def test_a_task_names_the_build_that_runs_it(name):
    task = OnCommitTask()
    task.name = name

    context = task.worker_history_context()

    assert (context["version"], context["build"]) == (__version__, CONFIG.BUILD)


@given(path=st.sampled_from(["/", "/login/", "/logout/", "/users/user/", "/users/sitesettings/"]))
def test_the_admin_host_serves_the_admin_at_its_root(path):
    assert resolve(path, urlconf="{{ cookiecutter.project_slug }}.urls.admin").namespace == "admin"
