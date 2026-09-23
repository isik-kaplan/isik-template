# isik-template

A cookiecutter template for single-tenant Django + Next.js applications, built on the
[isik](https://github.com/isik-kaplan/isik) Python package and
[@isikk/core](https://github.com/isik-kaplan/isik-ts) TypeScript package, following conventions
established across several prior Django + Next.js projects built the same way.

Stack: Django + django-hosts + django-allauth (headless) + drf-spectacular + django-pghistory/
pgtrigger + Celery/RabbitMQ, Next.js + shadcn/ui, all wired together in Docker Compose with a
Playwright e2e suite (mailpit, plus a disposable Authentik instance for social login) covering the
full auth surface end to end.

## Usage

```
uvx cookiecutter gh:isik-kaplan/isik-template
```

You'll be prompted for `project_name`, `description`, `author_name`, `author_email`, `domain`, and
`social_login_providers` - none of these have defaults; they're the choices that actually shape the
generated project. See `cookiecutter.json` for every field.

Login/signup/connections buttons get a real brand icon for the providers the frontend bundles one
for (google, apple, github, microsoft, facebook, slack, twitter_oauth2, linkedin_oauth2); every
other provider (there are ~100) stays text-only unless you point `social_login_provider_icons` at
one - `provider_id=url-or-path` pairs, comma-separated, e.g.
`openid_connect=/icons/my-idp.svg` for a file dropped into `apps/web/public/`, or any full URL.

## Developing this template

```
uv sync
uv run pytest
```

`tests/` bakes the template with several context fixtures (`tests/contexts/*.json`) and checks the
result at increasing cost:

- `test_bake_structure.py`, `test_docker_compose.py`, `test_pre_gen_validate.py` - fast, structural
  (no Docker/npm needed).
- `test_e2e.py` - bakes the "no-social-login" context, boots the full compose stack (including a
  disposable Authentik instance) and runs the Playwright suite against it - the one context whose
  login/signup page ("default"'s never exercises this) is otherwise untested. Slow (minutes); skips
  only if `docker` itself isn't available.

The "default" context's backend build/coverage, backend-mutation, frontend build/lint/test,
frontend-mutation and e2e are no longer hand-mirrored here at all: `scripts/bake_and_trigger_real_ci.py`
bakes it, force-pushes the result to a dedicated sandbox repo, and waits for *that* repo's own real
`ci.yml` to run - catching bugs in the workflow file itself (trigger conditions, job graph,
cache/action syntax) that replaying commands by hand never could. CI-only: it needs a
`BAKE_SANDBOX_TOKEN` secret (a PAT scoped to the sandbox repo - the default `GITHUB_TOKEN` is
deliberately blocked from triggering workflow runs it pushes itself), so it isn't part of
`uv run pytest`.

`hooks/_validate.py` (the bake-time validation `pre_gen_project.py` calls) has its own mutmut run
too, checked in `pre-gen-validate-mutation`, so both this repo's own tooling and the generated
project it produces carry the same 100%-mutation-clean bar - see `mutation-exemptions.toml` at the
root for this repo's own exemptions and the generated project's own copy for its.

Generated projects get their own `.github/workflows/ci.yml` covering the same tiers, plus
`frontend-mutation` (Stryker, `break: 100`).

## What's not implemented

- **Production deployment tooling.** Out of scope for v1 - this template covers local dev and e2e
  only.
