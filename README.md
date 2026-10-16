# isik-template

A cookiecutter template for single-tenant Django + Next.js applications, built on the
[isik](https://github.com/isik-kaplan/isik) Python package and
[@isikk/core](https://github.com/isik-kaplan/isik-ts) TypeScript package, following conventions
established across several prior Django + Next.js projects built the same way.

Stack: Django + django-hosts + django-allauth (headless) + drf-spectacular + django-pghistory/
pgtrigger + Celery/RabbitMQ and Garage (both optional), Next.js + shadcn/ui (optionally an Expo/React Native app alongside it),
all wired together in Docker Compose with a Playwright e2e suite (mailpit, plus a disposable
Authentik instance for social login) covering the full auth surface end to end.

`User` is tracked with `@track_events()`, exposed at `/v0/users/{id}/history/` and
`/v0/users/history/` to the account's owner and to staff only (showing what `UserSerializer` shows;
a password change, sign-in or permission change is listed, never its values) and named by whoever
caused them - a request's session, or, via `HistoryContextTask`, a Celery task the request dispatched.

Two-factor authentication is opt-in per user via `allauth.mfa`: an authenticator app (TOTP),
recovery codes, and passkeys - a passkey is a second factor only, never a password replacement
(`MFA_PASSKEY_LOGIN_ENABLED = False`). Anyone with a factor is challenged for it after their
password or social login; the profile's 2FA tab enrolls and removes factors. The e2e stack serves a
self-signed https listener beside plain http, since WebAuthn exists only in a secure context.

Every string is authored in English and everything (backend error/admin copy, web, mobile) is
translatable via `LANGUAGES`/`LocaleMiddleware`-equivalent wiring and i18next; the active language
is a signed-in `User.language` preference, falling back to the browser's own `Accept-Language` -
never a URL segment. `languages` (cookiecutter) names which languages a generated project ships;
`en` is always first and any others get real, empty catalogs scaffolded (not machine-translated) -
see the generated project's own `post_gen_project.py` printout for exactly which files to fill in.

Legal pages come as rendering without text: `/legal/<slug>` serves each document a generated project's owner writes
(terms of service and privacy policy by default), every footer links them, signup records which version was
accepted, and a cookie disclosure stands in for a banner, since nothing the app stores needs consent. Generation ends
by naming each file to write, and the generated `SETUP.md` covers that and every other first step, including an
optional draft from the AGPL-licensed app-privacy-policy-generator that never enters the generated repository.

Permissions are declared in code, as `where:action:what` names synced into `auth_permission` on every migrate, and
granted by the one rule that you may hand on only what you hold yourself; staff run the people list at
`/staff/people`. The project can also be an OAuth 2.0 / OpenID Connect provider for other apps
(django-oauth-toolkit), switched by `<PREFIX>__OAUTH_PROVIDER__MODE`: `off`, `approval` (anybody signed in registers
an app and a superuser approves it) or `auto`. An approved app signs people in with their consent, and can act for
them on the API with the permissions they let it have - never more than they hold themselves.

## Usage

```
uvx cookiecutter gh:isik-kaplan/isik-template
```

You'll be prompted for `project_name`, `description`, `author_name`, `author_email` and `domain` -
none of these have defaults; they're the choices that actually shape the generated project. See
`cookiecutter.json` for every field.

`languages` (default `en`) is a comma-separated list of ISO codes, `en` always first - e.g.
`en,tr`. It drives the backend's `LANGUAGES`, the frontend's i18next resources, and which languages
a signed-in user can pick between; see the generated project's own `README.md` for what an extra
language actually needs filled in before it ships.

Social login is not a question: a generated project offers whichever allauth providers its
`<PREFIX>__SOCIAL_LOGIN__PROVIDERS` env var names, read at startup by the backend and the web
frontend alike, so a provider is added later with an env change and a restart. Its buttons get a
real brand icon for the providers the frontend bundles one for (google, apple, github, microsoft,
facebook, slack, twitter_oauth2, linkedin_oauth2); any other stays text-only unless
`<PREFIX>__SOCIAL_LOGIN__ICONS` points at one - `provider_id=url-or-path` pairs, comma-separated.
The generated `SETUP.md` walks through it.

`include_mobile` (default `n`) adds an Expo/React Native app (`apps/mobile`) alongside the web
frontend, against the backend's existing `allauth.headless` app client (token-based, no cookies) -
login/signup/session/logout (including the second-factor step for an account with TOTP or recovery
codes), password reset, a `profile/` section (account details, emails,
password, connected accounts, active sessions), native Sign in with Google/Apple where
the build's `EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS` names them, and i18next/react-i18next wired to the device's own
locale (falling back to English), same `languages` list as the backend and web. The two screens
web reaches only via an email link
(`password-reset/[key]`, `verify-email/[key]`) are deliberately not mirrored here - allauth's
`HEADLESS_FRONTEND_URLS` points every such link at the web app's fixed origin regardless of which
client requested it, so a mobile version of those routes would never actually be opened. Unlike
everything else in this template, `include_mobile` is opt-in: most generated projects don't want a
companion mobile app, unlike (say) Celery, which nearly all of them eventually do.

`background_jobs` picks how tasks run: `celery-with-beat` (default) brings RabbitMQ, a Celery worker
and a beat scheduler; `celery` the worker without the scheduler; `inline` no broker and no worker -
tasks keep the same `@shared_task`/`.delay()` code and run in the request that asked for them, once
it commits (`CELERY_TASK_ALWAYS_EAGER`). `storage` picks where uploads go: `garage` (default)
bundles a one-node [Garage](https://garagehq.deuxfleurs.fr/) S3 for development, tests and production;
`s3` keeps that Garage for development and tests only and points production at a provider; `disk`
writes to a Docker volume through Django's `FileSystemStorage`, with no storage service at all. In
all three no stored file is public: a view decides who may have one and answers with
`apps.common.files.serve_file()`, and nginx sends the file (`X-Accel-Redirect`).

## Developing this template

```
uv sync
uv run pytest
```

`tests/` bakes the template with several context fixtures (`tests/contexts/*.json`) and checks the
result at increasing cost:

- `test_bake_structure.py`, `test_docker_compose.py`, `test_pre_gen_validate.py` - fast, structural
  (no Docker/npm needed).
- `test_e2e.py` - bakes the "minimal" context, switches social login off in its `e2e/.env`, boots the
  full compose stack (including a disposable Authentik instance) and runs the Playwright suite
  against it - the login/signup page without provider buttons is otherwise untested. Slow (minutes); skips
  only if `docker` itself isn't available.

The "minimal" context is the smallest stack (`inline` tasks, `disk` storage) and "self-tls" the
middle ground (`celery`, `s3`), so each answer is baked by some context.

The "default" context (`include_mobile: true` and two languages - the "everything on"
configuration, with the OIDC test IdP its `e2e/.env` switches on) has its backend build/coverage, backend-mutation, frontend
build/lint/test, frontend-mutation, mobile lint/test, mobile-mutation and e2e no longer
hand-mirrored here at all: `scripts/bake_and_trigger_real_ci.py`
bakes it, force-pushes the result to a dedicated sandbox repo, and waits for *that* repo's own real
`ci.yml` to run - catching bugs in the workflow file itself (trigger conditions, job graph,
cache/action syntax) that replaying commands by hand never could. CI-only: it needs a
`BAKE_SANDBOX_TOKEN` secret (a PAT scoped to the sandbox repo - the default `GITHUB_TOKEN` is
deliberately blocked from triggering workflow runs it pushes itself), so it isn't part of
`uv run pytest`.

`hooks/_validate.py` (the bake-time validation `pre_gen_project.py` calls) has its own mutmut run
too, checked in `pre-gen-validate-mutation`, so both this repo's own tooling and the generated
project it produces carry the same 100%-mutation-clean bar - see `mutation-exemptions.toml` at the
root for this repo's own exemptions, and the generated project's `mutation-equivalents.toml`/
`mutation-exemptions.toml` for its. Run it locally with `uv run python scripts/mutmut_run.py run`
rather than bare `mutmut run`: the wrapper names each mutant after the mutation it makes, which is
what the exemption keys are.

Generated projects get their own `.github/workflows/ci.yml` covering the same tiers. Its
`frontend-mutation` runs Stryker once per shard of `apps/web/scripts/mutation-shards.mjs` (a matrix read
from that file, with an incremental cache per shard, inside the same `tester` image as `frontend`), and
`mobile-mutation` runs it over the mobile app. Stryker's own `break` is off in both: the gate is
`packages/mutation-check/check-mutants.mjs`, which fails on any surviving mutant not named in that app's
`mutation-exemptions.json`, and on any entry no surviving mutant matches.

## What's not implemented

- **Production deployment tooling.** Out of scope for v1 - this template covers local dev and e2e
  only.
