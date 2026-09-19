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
- `test_backend_build.py`, `test_frontend_build.py` - build the real images, run the real backend
  test suite (100% coverage required) and the real frontend lint/type/build/test pipeline.
- `test_backend_mutation.py` - runs the generated project's own two-phase mutmut pipeline
  (template-cloned database, phase one, phase two, the survivor gate) against a real Postgres, the
  same commands its own `backend-mutation` CI job runs.
- `test_e2e.py` - boots the full compose stack (including a disposable Authentik instance) and runs
  the Playwright suite against it. Slow (minutes), but always runs - this is the tier that has
  caught every real bug this template has shipped; skips only if `docker` itself isn't available.

`hooks/_validate.py` (the bake-time validation `pre_gen_project.py` calls) has its own mutmut run
too, checked in `pre-gen-validate-mutation`, so both this repo's own tooling and the generated
project it produces carry the same 100%-mutation-clean bar - see `mutation-exemptions.toml` at the
root for this repo's own exemptions and the generated project's own copy for its.

Generated projects get their own `.github/workflows/ci.yml` covering the same tiers, plus
`frontend-mutation` (Stryker, `break: 100`).

## What's not implemented

- **Production deployment tooling.** Out of scope for v1 - this template covers local dev and e2e
  only.
