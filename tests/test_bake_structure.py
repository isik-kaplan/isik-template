from pathlib import Path

import pytest
from conftest import load_context


# Every test here bakes purely to check file layout, never to install anything - see
# conftest.py's skip_lockfile_generation.
pytestmark = pytest.mark.usefixtures("skip_lockfile_generation")


@pytest.mark.parametrize("context_name", ["default", "no-social-login", "self-tls"])
def test_bake_succeeds(cookies, context_name):
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0
    assert result.exception is None
    assert result.project_path.is_dir()


def test_include_mobile_controls_whether_apps_mobile_exists(cookies):
    # default.json has include_mobile: true; no-social-login.json omits it, so it takes
    # cookiecutter.json's own default (false) - one bake exercises each side for free.
    with_mobile = cookies.bake(extra_context=load_context("default"))
    assert with_mobile.exit_code == 0
    mobile_dir = with_mobile.project_path / f"{with_mobile.context['project_slug']}-frontend/apps/mobile"
    assert mobile_dir.is_dir()
    assert (mobile_dir / "package.json").is_file()

    without_mobile = cookies.bake(extra_context=load_context("no-social-login"))
    assert without_mobile.exit_code == 0
    no_mobile_dir = without_mobile.project_path / f"{without_mobile.context['project_slug']}-frontend/apps/mobile"
    assert not no_mobile_dir.exists()


def test_repo_slug_derived_from_project_name(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "project_name": "My Cool App"})
    assert result.exit_code == 0
    assert result.project_path.name == "my-cool-app"


@pytest.mark.parametrize("context_name", ["default", "self-tls"])
def test_no_unrendered_jinja_in_output(cookies, context_name):
    # "self-tls" exercises tls_termination's own self-termination branch (certbot/nginx :443
    # blocks, entrypoint.sh's dummy-cert bootstrap) - every one of those lives inside a
    # {% if cookiecutter.tls_termination == "self" %} block that "default" (tls_termination:
    # "external") never renders at all.
    result = cookies.bake(extra_context=load_context(context_name))
    assert result.exit_code == 0

    # Any source file wrapped in {% raw %} is expected to still contain literal "{{"/"{%" in its
    # output - that's what raw means (Django template vars in email templates, i18next
    # interpolation in auth.json) - so check the source, not the rendered copy, for that marker.
    # Directory names under the template root are themselves Jinja ("{{cookiecutter.project_slug}}"
    # etc.), so the rendered relative path has to be translated back to the source one before we
    # can look the source file up.
    template_root = Path(__file__).parent.parent / "{{cookiecutter.repo_slug}}"
    raw_escaped_relative_paths = set()
    for source_path in template_root.rglob("*"):
        if not source_path.is_file():
            continue
        if "{% raw" in source_path.read_text(errors="ignore"):
            relative = source_path.relative_to(template_root).as_posix()
            rendered_relative = relative.replace("{{cookiecutter.project_slug}}", result.context["project_slug"])
            raw_escaped_relative_paths.add(rendered_relative)

    for path in result.project_path.rglob("*"):
        relative = path.relative_to(result.project_path).as_posix()
        if not path.is_file() or relative in raw_escaped_relative_paths:
            continue
        text = path.read_text(errors="ignore")
        # ci.yml needs a literal "${{ hashFiles(...) }}" (GitHub Actions' own expression syntax) in
        # its output, produced via the "{{ '${{' }}" Jinja string-literal escape rather than a raw
        # block - a real unrendered cookiecutter expression is never preceded by "$".
        assert "{{" not in text.replace("${{", ""), f"unrendered Jinja expression in {path}"
        assert "{%" not in text, f"unrendered Jinja tag in {path}"


def test_license_file_matches_choice(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "license": "MIT"})
    assert result.exit_code == 0
    assert "MIT License" in (result.project_path / "LICENSE").read_text()


@pytest.mark.parametrize(
    "override,reason",
    [
        ({"project_name": ""}, "blank project_name"),
        ({"description": ""}, "blank description"),
        ({"author_name": ""}, "blank author_name"),
        ({"author_email": ""}, "blank author_email"),
        ({"domain": ""}, "blank domain"),
        ({"domain": "localhost"}, "bare localhost domain"),
        ({"domain": "admin.localhost"}, "*.localhost domain"),
        ({"domain": "no-dot-domain"}, "domain with no dot"),
        ({"social_login_providers": "not-a-real-provider"}, "unknown provider slug"),
        ({"social_login_provider_icons": "no-equals-sign"}, "icon entry missing '='"),
        ({"social_login_provider_icons": "=https://example.test/x.svg"}, "icon entry with blank provider id"),
        ({"social_login_provider_icons": "google="}, "icon entry with blank url"),
        (
            {"social_login_provider_icons": "not-a-real-provider=https://example.test/x.svg"},
            "icon for unknown provider",
        ),
        (
            {"social_login_provider_icons": "google=https://a.test/g.svg,google=https://b.test/g2.svg"},
            "icon entry listing the same provider twice",
        ),
        (
            {"social_login_provider_icons": "slack=https://example.test/slack.svg"},
            "icon for a provider not in social_login_providers",
        ),
    ],
)
def test_pre_gen_validation_rejects(cookies, override, reason):
    result = cookies.bake(extra_context={**load_context("default"), **override})
    assert result.exit_code != 0, f"expected rejection for {reason}"


def test_all_keyword_accepted_for_providers(cookies):
    result = cookies.bake(extra_context={**load_context("default"), "social_login_providers": "all"})
    assert result.exit_code == 0


def test_social_login_provider_icons_renders_into_socialProviders_ts(cookies):
    # openid_connect - one of default.json's own social_login_providers - has no bundled brand
    # icon (apps/web/src/components/app-auth/icons/brands.tsx), so this is the realistic case a
    # deployment would actually configure. google, also requested but left unconfigured here,
    # exercises the "" (no override, bundled icon wins) side of the same render.
    result = cookies.bake(
        extra_context={
            **load_context("default"),
            "social_login_provider_icons": "openid_connect=https://example.test/idp-icon.svg",
        }
    )
    assert result.exit_code == 0

    social_providers_ts = (
        result.project_path
        / f"{result.context['project_slug']}-frontend"
        / "apps"
        / "web"
        / "src"
        / "lib"
        / "socialProviders.ts"
    ).read_text()
    assert "icon: 'https://example.test/idp-icon.svg'" in social_providers_ts
    assert "{ id: 'google', name: 'Google', icon: '' }" in social_providers_ts


def test_tls_termination_self_adds_certbot_and_443(cookies):
    result = cookies.bake(extra_context=load_context("self-tls"))
    assert result.exit_code == 0

    server_dir = f"{result.context['project_slug']}-server"
    compose = (result.project_path / "docker-compose.yml").read_text()
    nginx_conf = (result.project_path / server_dir / "template.nginx.conf").read_text()
    dockerfile = (result.project_path / server_dir / "Dockerfile").read_text()
    env_example = (result.project_path / ".env.example").read_text()

    assert "certbot:" in compose
    assert '"443:443"' in compose
    assert "letsencrypt:" in compose
    assert "listen 443 ssl" in nginx_conf
    assert "acme-challenge" in nginx_conf
    assert "apk add --no-cache openssl" in dockerfile
    assert f"{result.context['config_prefix']}__TLS__ACME_EMAIL" in env_example


def test_tls_termination_external_has_no_certbot_or_443(cookies):
    result = cookies.bake(extra_context=load_context("default"))
    assert result.exit_code == 0

    server_dir = f"{result.context['project_slug']}-server"
    compose = (result.project_path / "docker-compose.yml").read_text()
    nginx_conf = (result.project_path / server_dir / "template.nginx.conf").read_text()
    dockerfile = (result.project_path / server_dir / "Dockerfile").read_text()
    env_example = (result.project_path / ".env.example").read_text()

    assert "certbot" not in compose
    assert "443" not in compose
    assert "listen 443" not in nginx_conf
    assert "acme-challenge" not in nginx_conf
    assert "openssl" not in dockerfile
    assert "__TLS__ACME_EMAIL" not in env_example
