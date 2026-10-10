# {{ cookiecutter.project_name }}

{{ cookiecutter.description }}

Generated from [isik-template](https://github.com/isik-kaplan/isik-template).

## Before you start

**[SETUP.md](SETUP.md)** is the checklist of everything to do after generating this project - `.env`, the first
superuser, DNS and TLS, social login providers, the legal documents and more. What follows explains how it works.

This app is **not servable at plain `localhost`** - cross-subdomain session/CSRF cookies (shared
across `api.`, `admin.`, `auth.{{ cookiecutter.domain }}`) need a real registrable domain. Add to
`/etc/hosts`:

```
127.0.0.1 api.{{ cookiecutter.domain }} admin.{{ cookiecutter.domain }} auth.{{ cookiecutter.domain }}
```

or point real DNS at these subdomains if deploying to the real domain instead.

## Running it

```
docker compose build
docker compose up -d
```

Split rather than `up -d --build` in one shot: `worker`/`scheduler` share `backend`'s image tag
with no `build:` of their own, and starting them before that build finishes tagging the image can
race compose into trying to pull it instead of using what was just built.

Brings up `database`, `broker`, `storage`, `backend`, `worker`, `scheduler`, `frontend`, and `server` (nginx,
{%- if cookiecutter.tls_termination == "self" %}
plus `certbot`; `server` is the only service publishing a host port, now on both `80` and `443`).
Visit `https://{{ cookiecutter.domain }}` - see "TLS" below before the very first boot.
{%- else %}
the only service publishing a host port). Visit `http://{{ cookiecutter.domain }}`.
{%- endif %}
`.env` was already created for you at generation time by `scripts/setup.sh` (cookiecutter's own
last step) - see `.env.example`'s own header comment before changing anything in it. Rerun
`bash scripts/setup.sh` by hand later to redo that choice - e.g. to move this same checkout from
local development to a real deployment, which generates strong secrets and prompts for real
domain/SMTP/OAuth/Sentry config instead of leaving `.env.example`'s dev defaults in place.

## Object storage

Uploads (`FileField`/`ImageField`, anything through `default_storage`) go to S3 via django-storages.
Locally that is the `storage` service, LocalStack running only S3, pinned to `4.14.0`: every
LocalStack release from `2026.03.0` on refuses to start without an account and auth token. The app
never creates a bucket - `s3:CreateBucket` is a provisioning permission the web process should not
hold - so LocalStack creates `{{ cookiecutter.config_prefix }}__STORAGE__BUCKET_NAME` itself when it comes up
(`localstack/init/ready.d/create-bucket.sh`), and a real deployment provisions its own. LocalStack's
community edition keeps nothing across a restart, so treat it as dev and demo storage only - point the
`{{ cookiecutter.config_prefix }}__STORAGE__*` variables at a real S3-compatible bucket for a deployment
(`bash scripts/setup.sh` asks for them, and you create the bucket). Inspect it by hand on the
loopback port it publishes:

```
aws --endpoint-url=http://localhost:4566 s3 ls s3://{{ cookiecutter.repo_slug }}/
```

The backend tests write to real LocalStack too, never a mock - each pytest worker gets a bucket of
its own (`<bucket>-test-<worker>`), the way it gets a database of its own.

## TLS
{% if cookiecutter.tls_termination == "self" %}
This project terminates its own TLS: nginx serves `:443` off a certificate the `certbot` service
(see `docker-compose.yml`) obtains and renews automatically via Let's Encrypt's HTTP-01 challenge,
which only works once `{{ cookiecutter.domain }}`, `api.{{ cookiecutter.domain }}`,
`admin.{{ cookiecutter.domain }}`, and `auth.{{ cookiecutter.domain }}` resolve, over real DNS, to
this host's public IP. Point DNS there *before* the first `docker compose up -d` - nginx starts
immediately either way (off a throwaway self-signed certificate, see
`{{ cookiecutter.project_slug }}-server/certificate.sh`), but every client sees that placeholder
cert, with a browser warning, until certbot's first real one lands - nginx switches to it within a
minute. Running this locally instead (the `/etc/hosts` setup above) never satisfies that challenge -
expect the self-signed cert there and either accept the browser warning or add it to your local
store yourself, the same way `.env.example`'s dev defaults already assume plain HTTP for local work
in the first place.

A real deployment of this project must be reachable on both `80` and `443` directly - nothing else
is meant to sit in front of it. That is also what `{{ cookiecutter.config_prefix }}__TRUSTED_PROXY_COUNT` defaults
to (`1`, nginx alone): allauth rate-limits by the address that many `X-Forwarded-For` entries from
the right, so a proxy added in front later has to append to that header and raise the count by one.
{%- else %}
This project serves plain HTTP (`:80`) only - it expects a TLS-terminating load balancer or
reverse proxy in front of it in any real deployment (a platform's own (Fly.io/Render/Railway/an
AWS ALB/Cloudflare), or your own nginx/Caddy on the same host), which forwards to this stack's
`server` container and sets `X-Forwarded-Proto` the way
`{{ cookiecutter.project_slug }}-server/template.nginx.conf`'s own comments describe - get that
wrong and `settings.py`'s `SECURE_PROXY_SSL_HEADER` trusts whatever the client sent instead,
which lets anyone choose the scheme of an emailed password-reset link. It must pass the browser's
`Host` through unchanged: nginx answers only this project's names and sets `X-Forwarded-Host` from
`Host` itself, so a balancer that rewrites it gets every request dropped. Regenerate with
`tls_termination: self` instead if you'd rather this project terminate its own TLS via certbot,
with no separate proxy to run.

That load balancer has to append to `X-Forwarded-For` rather than replace it, and
`{{ cookiecutter.config_prefix }}__TRUSTED_PROXY_COUNT` has to count it: allauth rate-limits by the address that many
entries from the right. Unset, it is `2` (the load balancer plus nginx), which `scripts/setup.sh`'s
deployment mode writes for you, adding one per further proxy. `.env.example` sets `1` for local
development, where the browser reaches nginx directly - left at `1` behind a load balancer, every
visitor shares its address and one rate-limit bucket.

nginx publishes on `127.0.0.1` only, which suits a load balancer on the same host. One on another host
(an AWS ALB, say) reaches it once `{{ cookiecutter.config_prefix }}__HTTP_BIND` is set to this host's private address. Firewall
that port to the load balancer alone: a request that reaches nginx directly skips it, so the proxy count
above trusts an `X-Forwarded-For` entry the client wrote, and nginx passes on the client's own
`X-Forwarded-Proto`, letting it choose the scheme of emailed links and OAuth redirects.

### Local HTTPS

Some browser APIs exist only in a secure context - WebAuthn/passkeys, service workers, parts of the
clipboard API - so on this stack's plain `http://{{ cookiecutter.domain }}` they are simply undefined.
For local development only:

```
bash scripts/dev-tls.sh
docker compose up -d --force-recreate server frontend
```

It mints a certificate for `{{ cookiecutter.domain }}` and its `api.`/`admin.`/`auth.` subdomains into
`{{ cookiecutter.project_slug }}-server/dev-tls/` (gitignored) - with [mkcert](https://github.com/FiloSottile/mkcert)
if it's installed, so the browser trusts it outright, or self-signed otherwise, which needs a
click-through and still leaves WebAuthn off in Chromium (it refuses any certificate error). It also
adds `docker-compose.dev-tls.yml` to `COMPOSE_FILE` in `.env`, which publishes `:443` (override with
`{{ cookiecutter.config_prefix }}__HTTPS_PORT`) and hands the frontend the CA for its server-side
fetches. Plain HTTP keeps working beside it; `https://{{ cookiecutter.domain }}` is the secure one.
Rerunning it is safe - it keeps a still-valid certificate. Never run it on a real deployment: that
gets its TLS from the proxy in front of it.
{%- endif %}
{% if cookiecutter.include_mobile %}
The mobile app (`{{ cookiecutter.project_slug }}-frontend/apps/mobile`) isn't part of the compose
stack - it talks to the same backend over plain HTTP, pointed at by two env vars Expo embeds at
build time:

```
cd {{ cookiecutter.project_slug }}-frontend/apps/mobile
EXPO_PUBLIC_API_ORIGIN=http://api.{{ cookiecutter.domain }} EXPO_PUBLIC_AUTH_ORIGIN=http://auth.{{ cookiecutter.domain }} npm run start
```

The iOS Simulator shares this machine's own `/etc/hosts`, so the domain above works as-is. A
physical device or the Android emulator doesn't - point at this machine's LAN IP instead (or
`10.0.2.2` for the Android emulator specifically).
{% if 'google' in cookiecutter.social_login_providers.split(',') or 'apple' in cookiecutter.social_login_providers.split(',') or cookiecutter.social_login_providers.strip() == 'all' %}
Native Google/Apple sign-in (`apps/mobile/lib/nativeSignIn.ts`) needs a custom dev client, not
Expo Go - `npx expo run:ios` / `npx expo run:android` (or an EAS development build) after adding
your own real credentials: a Google OAuth iOS client ID (its reversed form as `iosUrlScheme` in
`app.config.ts`'s `@react-native-google-signin/google-signin` plugin entry) and, for Apple, a
provisioning profile with the Sign in with Apple capability enabled. Until those exist, the
buttons render (when `social_login_providers` includes `google`/`apple`) but the native pickers
will fail to open.
{% endif %}
{% endif %}
{% if cookiecutter.languages.split(',')|length > 1 %}
## Translations

Every string is authored in English; `languages` also named {{ cookiecutter.languages.split(',')[1:]|map('trim')|join(', ') }}, so `post_gen_project.py` already scaffolded real, empty catalogs for
{{ 'them' if cookiecutter.languages.split(',')|length > 2 else 'it' }} at generation time (its own
printout named the exact files) - fill in the backend `locale/<lang>/LC_MESSAGES/django.po` and the
frontend `locales/<lang>/*.json` files before shipping that language. A signed-in user's language
preference (`User.language`, editable from the profile page) picks between whatever `LANGUAGES`
ends up configured with; a visitor with no preference gets their browser's own language instead.
{% endif %}
## Backend conventions

- **Every request is a transaction** (`ATOMIC_REQUESTS`). A view opts out only through
  `apps.common.transactions.not_atomic(reason)`, and a system check refuses one that used Django's
  `non_atomic_requests` directly. Anything that cannot roll back (mail, Celery dispatch) waits for
  `transaction.on_commit` - `OnCommitTask` and `AccountAdapter.send_mail` already do. Account mail
  is rendered in the request and sent by the `worker`, which retries an SMTP outage, so under DEBUG
  the console backend prints it in the worker's log rather than the backend's.
- **Every POST takes an `Idempotency-Key` header** (a UUID per attempt, not per call). `BaseModelViewSet`
  carries isik's `IdempotencyMixin`, so a retried request replays the first answer rather than doing the
  work twice; a system check refuses a routed POST that neither honours a key nor names a
  `NoIdempotencyKey(reason=...)` from `apps/idempotency/exemptions.py`. Clients mint the key with `@isikk/core`'s `useIdempotencyKey()` (or
  `useValidatedFormState`, which passes one to its `submit` call).
- **Raw SQL never spells a table or column name.** Resolve them with `apps.common.db.model_db_name` /
  `model_db_column`, building trigger bodies in a `BuiltTrigger(build=...)`; `test_raw_sql_names.py`
  sweeps the tree for literals.
- **A stored secret is an `EncryptedField`**, paired with a `refuse_plaintext` trigger so no writer can
  land it in the clear. It is keyed from `CREDENTIAL_KEY`, never `SECRET_KEY`.
- **No column repeats what the history log records.** A tracked model gets no `*_at`/`*_by` field for a
  fact its event table already holds - a second source of truth that can disagree with the first. The
  exceptions are a column read in a hot-path `WHERE` (keep a status field, take the timestamp from
  history), one that is a live authorization input rather than an audit record, and `User.terms_version` /
  `terms_accepted_at`: a later terms change asks whoever accepted an older version to accept again, which makes
  them an input to that rather than a record of it.
- **The permission catalog is protected in the database**: `auth_permission` refuses a delete or an
  identity change, and `django_content_type` a delete. Retire one on purpose inside `pgtrigger.ignore(...)`.

## Logging

The backend logs through a closed vocabulary in `{{ cookiecutter.project_slug }}/apps/common/logging/`, never through
`logging.getLogger` (ruff's `TID251` refuses it). A log line is a call that cannot be made wrongly:

```python
from apps.common.logging import PERMISSION_REFUSED, log

log(PERMISSION_REFUSED, permission="not_authenticated")
```

- **The event must be declared** in `apps/common/logging/events.py`. `log()` refuses anything else, so a
  new line is a reviewed line in that file rather than a string invented at the call site.
- **The fields it declares are required.** A missing one is a `TypeError` naming it.
- **Who and where are not passed.** `ambient()` reads them from the pghistory context the request (or
  Celery task) already opened, so a log line and the history rows it wrote cannot disagree about who
  acted. `code` (the calling module) is added too.
- `note=` is free text for a person, and nothing should be knowable only from it.

To add an event, declare it beside its neighbours and export it from `apps/common/logging/__init__.py`:

```python
# A noun and a past-tense verb, dotted, lowercase: the name is what every query searches by.
# Severity is fixed here, not chosen per call site.
MFA_ENABLED = declare("mfa.enabled", logging.INFO, ("user", "method"))
```

Anything that moves control of an account (a password changed or reset, the primary address changed)
is declared with `audited=True` and written with `audit()` instead. It goes to the
`{{ cookiecutter.project_slug }}.audit` logger, which has its own handler and does not propagate, so turning
the main logger down during an incident never silences it. `log()` refuses an audited event and
`audit()` refuses an ordinary one. In tests, the `logged` and `audited` fixtures (root `conftest.py`)
collect what each call wrote as plain dicts.

`LOGGING__FORMAT` picks `console` (one aligned line) or `json` (one object per line, for a collector).
`RequestLogMiddleware` writes a `request` line for every non-2xx or slow request (`LOGGING__REQUESTS`,
`LOGGING__SLOW_REQUEST_MS`). What it says about the request is deny-by-default: a body or query value is
only written when its name is in `LOGGABLE` (`apps/common/logging/redaction.py`), everything else shows
up as `[redacted]`, and headers are an allowlist of their own, so `Authorization`, `Cookie` and
`X-CSRFToken` never pass. Sentry (on only when `SENTRY__DSN` is set) applies the same rule through
`before_send`, drops cookies outright, and runs with `send_default_pii=False`.

## Sensitive actions and locking sign-in down

Acts that change who can get into an account (adding, removing or promoting an email, setting a first
password, connecting or disconnecting a provider, ending another session) ask the person to prove it
is them again first: the API answers with `X-Reauthentication-Required: 1`, and the frontend sends
them to `/auth/prove` and back. A proof is spent by the one act it was asked for. Somebody with a
password types it; somebody who signed up through an OpenID Connect provider signs in there again
(it has to report a fresh `auth_time`); anybody without a password can also set one from an emailed
link. `apps/users/tests/test_reauthentication_gate.py` fails until every routed write is classified
as gated or not an act.

For an incident, **Site settings** in the admin holds a "who may sign in" ladder (everyone, staff,
superusers only). Raising it signs out everybody it excludes straight away and refuses them on both
the password and the social sign-in; only a superuser can choose the top rung.

## Starter kit

These ship tested and mutation-clean but with nothing calling them yet: building blocks for what most projects
grow into. Use one where it fits, or delete it with its tests and catalog entries the day it is clear it never
will.

- **`RemoteCombobox`** (`components/app/RemoteCombobox.tsx`): a picker that searches the server as you type,
  for choosing among more rows than one page holds. Pass `search(term, page)`, wrapping a list call in
  `pageOf(...)`, and `onPick`.
- **`Editor`** (`components/app/Editor.tsx`): a tiptap rich-text editor that reports HTML through `onChange`.
  Add tiptap extensions as the content model needs them.
- **`LoadingOverlay`** (`components/app/LoadingOverlay.tsx`): dims a table, form or panel while it loads
  without unmounting it, so scroll position and layout survive. Wrap the content and pass `loading`.
- **`dialog`** (`components/base/dialog.tsx`): the modal primitives (`Dialog`, `DialogTrigger`,
  `DialogContent`, ...), for a confirmation or a short form over the page.
- **`skeleton`** (`components/base/skeleton.tsx`): a placeholder block that holds a shape while data loads.
  `<Skeleton className="h-4 w-32" />`.
- **`EncryptedField`** (`apps/common/fields/encrypted.py`): a column for a secret to somebody else's system,
  stored enciphered. Declare `EncryptedField()`, add a `BuiltTrigger` built from
  `apps.common.sql.refuse_plaintext`, and set `CREDENTIAL_KEY` (`scripts/setup.sh` generates one for a
  deployment).
- **The DRF reauthentication gate** (`apps/common/api/reauthentication.py`): the same "prove it is you" step
  the account routes use, for your own viewsets. Mix `ProvesWhoTheyAre` into the viewset and name exempt
  actions in `reauthentication_exempt_actions` with a reason; everything else is gated.
## Legal pages and cookies

`/legal/<slug>` renders each document `apps/web/src/legal/documents.json` names from
`apps/web/src/legal/<language>/<slug>.md`, falling back to English, and says a document has not been added yet while
its file is missing. The footer links every document; signup (password or social, web and mobile) says continuing
means agreeing to them, and the account adapter records `User.terms_version` and `terms_accepted_at`. The template
ships no legal text - [SETUP.md](SETUP.md) covers writing or generating it.

There is no cookie banner because nothing needs one: the session and CSRF cookies are strictly necessary, and the
theme, kept in local storage, is a choice the visitor made. Both kinds need disclosing, not consent, so the footer
carries a one-line disclosure and the privacy policy page renders a cookies section from
`apps/web/src/legal/storage.json`. `e2e/playwright/tests/legal/storage-disclosure.spec.ts` signs up, signs in and walks
the app, then fails on any cookie or storage key that list leaves out.

Adding analytics, advertising, embedded third-party content or anything else not strictly necessary means consent
first, under GDPR and the ePrivacy rules, before anything is set:

- Add a consent banner (shadcn's dialog or drawer, in `components/base/`, will do) with accept and reject offered
  equally, and keep the choice in a cookie or local storage key of its own, itself listed in `storage.json`.
- Expose the choice through one provider in `app/layout.tsx`, beside `SiteFooter`, and load every non-essential
  script only from a component that renders once consent is given (`next/script` inside it), never from the page
  head.
- Let people change their mind: a "cookie settings" link in `SiteFooter` that reopens the banner, and removal of
  whatever the refused category had already set.
- List each new item in `storage.json` with its purpose. The e2e spec above keeps failing until you do, which is the
  point - and update the privacy policy to name the service and what it receives.

No consent hook ships with the template: with nothing to gate, it would be code no test can give a reason to exist.

## Testing

```
docker compose up -d --wait database storage
docker compose run --rm --no-deps backend python -m pytest   # backend, 100% coverage required
cd {{ cookiecutter.project_slug }}-frontend && npm install && npm run lint && npm run test
cd e2e && docker compose build && docker compose up -d && docker compose run --build --rm playwright npx playwright test
```

`docker compose run --rm frontend-test` runs the web and API-client suites inside the frontend
Dockerfile's own `tester` stage instead of on whatever node your machine has - the way CI runs them.

Translation keys are typed from the English catalogs (`apps/web/src/i18n/i18next.d.ts`), so a
mistyped or missing key fails `npm run lint`, not the page - write keys out in full rather than
assembling them from a variable, which the type checker cannot follow.
{% if cookiecutter.include_mobile %}
`apps/mobile` has its own unit/component suite, run the same way:
`cd {{ cookiecutter.project_slug }}-frontend/apps/mobile && npm run test`. No device/emulator e2e
yet - see `.github/workflows/ci.yml`'s `mobile`/`mobile-mutation` jobs for what does run in CI.
{% endif %}
`.github/workflows/ci.yml` runs all of the above on every push/PR.

### Mutation testing

The backend is held to a 100% mutation kill rate (mutmut, `backend-mutation` in CI). A mutant no test
can kill goes in `mutation-equivalents.toml`, keyed by a hash of the mutation itself
(`scripts/mutation_naming.py`), so an entry follows its mutant through unrelated edits and goes stale
the moment the mutation does. When the reason is a fact about a library rather than this code, the
entry names a test in `apps/common/tests/test_library_assumptions.py` with `verified_by`, and that
test re-checks it on every push instead of a full re-run. `mutation-exemptions.toml` is only for
whole functions mutmut's tracing cannot attribute to any test.

To diagnose survivors locally:

```
docker compose run --rm backend python -m scripts.toolbox.hunt apps/users/adapters/account.py apps/users/tests
docker compose run --rm --no-deps backend python -m scripts.toolbox.triage unsettled.txt --diffs
docker compose run --rm --no-deps backend python -m scripts.toolbox.check_exemption_keys
```

`MUTMUT_DB_TEMPLATE` (see `scripts/mutation_template.py build`/`name`) makes any test run - a hunt, or
an ordinary `pytest -n auto` - clone a migrated database instead of migrating one per session.
A hunt killed outright (`kill -9`, a closed terminal) leaves its `test_*hunt<slot>` databases behind,
and enough of them end in Postgres's "out of shared memory"; drop them, or `docker compose down -v`.
After a mutation run, `python -m scripts.case_only_mutants` lists literals whose upper- and lower-cased
mutants got different verdicts - one of each pair is wrong, and CI prints the same list without failing.

The web app is held to the same bar by Stryker, sharded by what a file is for
(`apps/web/scripts/mutation-shards.mjs`, one CI job per shard). Run one shard locally with
`npx stryker run --mutate "$(node scripts/mutation-shards.mjs auth)"` from `apps/web`, then
`node ../../packages/mutation-check/check-mutants.mjs .`, which fails on any survivor that
`mutation-exemptions.json` does not name, and on any entry that no survivor matches.

## Conventions the build enforces

Each of these fails a commit (pre-commit) and CI rather than relying on review:

- **One of a thing per file.** A module named for a kind (`serializers`, `viewsets`, `views`, `models`,
  `filters`, `fields`, `permissions`, `adapters`, `middleware`, `admin`, ...) becomes a folder with one
  member per file once it holds two, and a governed file holds nothing but its kind - a helper goes onto
  the model or into a utility module (`apps/common` is that package). `layout-check` runs
  `{{ cookiecutter.project_slug }}/scripts/layout_check.py`; a deliberate exception goes in its
  `EXCEPTIONS` with the reason.
- **Every field says what it is.** Each model field this project declares carries a `help_text` (the
  published API description) and a `db_comment` (what someone in psql sees), or
  `NoHelpText(reason=...)` / `NoComment(reason=...)` from `apps/common/schema_docs.py` saying why it needs none.
  A Django system check (`schema_docs.E001`) refuses to start otherwise.
- **Every opt-out names the rule it skips.** The sentinels above, `NotAtomicReason`, `NoIdempotencyKey`,
  `NoReplay` and isik's own registry opt-outs are isik `Exemption` types that refuse a reason too short
  to be one; `python manage.py exemptions` lists them by rule.
- **Serializers over a `BaseModel` list `created_at` and `updated_at`.** By hand - a sweep test in
  `apps/common/tests/test_serializer_conventions.py` checks every `apps/*/api/serializers/` module.
- **The API documents are clean and the clients match them.** `openapi-check` fails on any
  drf-spectacular warning, then checks `packages/api/src/schema.ts` is exactly what openapi-typescript
  generates from the current API, and that every endpoint the hand-written `packages/auth-api` declares
  is one allauth still serves. After changing the API, regenerate the client and commit it:
  `scripts/pre-commit/openapi_check.sh --write`.
