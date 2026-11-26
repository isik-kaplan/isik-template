"""The project's own wiring: provider credentials read from the environment, and a task's build stamp."""

import pytest
from django.core.exceptions import ImproperlyConfigured
from hypothesis import given
from hypothesis import strategies as st

from apps.users.social_login import FRESH_SIGN_IN, social_account_providers, social_app

from {{ cookiecutter.project_slug }} import __version__
from {{ cookiecutter.project_slug }}.celery_task import OnCommitTask
from {{ cookiecutter.project_slug }}.config import CONFIG


ENV = st.none() | st.text(st.characters(codec="ascii", categories=["L", "N"]), max_size=10)


PREFIX = "{{ cookiecutter.config_prefix }}__OAUTH"
ISSUERS = st.from_regex(r"[a-z][a-z0-9_-]{0,11}", fullmatch=True)


# One test per kind, so an issuer's own keys are read in every run.
@pytest.mark.parametrize("provider", ["google", "github", "openid_connect", "microsoft"])
@given(
    issuer=ISSUERS,
    client_id=ENV,
    secret=ENV,
    name=ENV,
    server_url=ENV,
    # Anything but true or false, in any case, refuses to start.
    fresh=st.none() | st.sampled_from(["true", "false", "True", "FALSE", "yes", ""]),
)
def test_a_providers_app_is_read_from_its_own_environment_keys(
    provider, issuer, client_id, secret, name, server_url, fresh
):
    entry = f"{provider}:{issuer}" if provider == "openid_connect" else provider
    own = f"{PREFIX}__{(issuer if provider == 'openid_connect' else provider).upper().replace('-', '_')}"
    drawn = {
        "CLIENT_ID": client_id,
        "CLIENT_SECRET": secret,
        "NAME": name,
        "SERVER_URL": server_url,
        "FRESH_SIGN_IN": fresh,
    }
    environ = {f"{own}__{key}": value for key, value in drawn.items() if value is not None}
    # Another provider's keys beside them, which this one must not read.
    environ |= {f"{PREFIX}__OTHER__CLIENT_ID": "not-mine", f"{PREFIX}__OTHER__FRESH_SIGN_IN": "maybe"}
    declared = None if fresh is None else fresh.lower() == "true"
    if (fresh is not None and fresh.lower() not in ("true", "false")) or (declared and provider not in FRESH_SIGN_IN):
        with pytest.raises(ImproperlyConfigured):
            social_app(entry, environ, PREFIX)
        return

    app = social_app(entry, environ, PREFIX)

    assert (app["client_id"], app["secret"], app["key"]) == (client_id or "", secret or "", "")
    fresh_sign_in = FRESH_SIGN_IN.get(provider) if declared is None else declared
    if provider == "openid_connect":
        named = " ".join(word.capitalize() for word in issuer.replace("-", "_").split("_"))
        assert (app["provider_id"], app["name"]) == (issuer, named if name is None else name)
        assert app["settings"] == {"fresh_sign_in": fresh_sign_in, "server_url": server_url or ""}
    elif provider in FRESH_SIGN_IN:
        assert set(app) == {"client_id", "secret", "key", "settings"}
        assert app["settings"] == {"fresh_sign_in": fresh_sign_in}
    else:
        assert set(app) == {"client_id", "secret", "key"}


@given(
    issuers=st.lists(ISSUERS, unique=True, max_size=3),
    others=st.lists(st.sampled_from(["google", "github", "microsoft"]), unique=True, max_size=3),
)
def test_every_issuer_is_one_apps_of_openid_connect_and_every_other_provider_has_its_own(issuers, others):
    entries = [*others, *(f"openid_connect:{issuer}" for issuer in issuers)]

    providers = social_account_providers(entries, {}, PREFIX)

    assert sorted(providers) == sorted([*others, *(["openid_connect"] if issuers else [])])
    assert all(len(providers[provider]["APPS"]) == 1 for provider in others)
    assert [app["provider_id"] for app in providers.get("openid_connect", {"APPS": []})["APPS"]] == issuers


@given(name=st.from_regex(r"[a-z_]{1,12}", fullmatch=True))
def test_a_task_names_the_build_that_runs_it(name):
    task = OnCommitTask()
    task.name = name

    context = task.worker_history_context()

    assert (context["version"], context["build"]) == (__version__, CONFIG.BUILD)
