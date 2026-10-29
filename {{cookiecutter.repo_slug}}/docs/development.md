# Developing {{ cookiecutter.project_name }}

How to write code here, and what the build holds it to. [README.md](../README.md) covers what the project
is and how to run it; [SETUP.md](../SETUP.md) what to do before launch.

## Backend conventions

- **Every request is a transaction** (`ATOMIC_REQUESTS`). A view opts out only through isik's
  `not_atomic(reason)`; isik's check `isik.E011` refuses one that used Django's `non_atomic_requests`
  directly. Anything that cannot roll back waits for the commit: Celery tasks are dispatched on commit
  (`HISTORY_TASK_DISPATCH_ON_COMMIT`), and `AccountAdapter.send_mail` uses `transaction.on_commit`. Account mail
{%- if cookiecutter.background_jobs == "inline" %}
  is rendered and sent by a task, which retries an SMTP outage - inline, once the request commits.
{%- else %}
  is rendered in the request and sent by the `worker`, which retries an SMTP outage, so under DEBUG
  the console backend prints it in the worker's log rather than the backend's.
{%- endif %}
- **Every write (POST, PUT, PATCH, DELETE) takes an `Idempotency-Key` header** (a UUID per attempt, not
  per call). isik's `BaseModelViewSet` carries `IdempotencyMixin`, so a retried request replays the first
  answer rather than doing the work twice; isik's check `isik.E005` refuses a routed write that neither
  honours a key nor names a `NoIdempotencyKey(reason=...)`. Clients mint the key with `@isikk/core`'s
  `useIdempotencyKey()` (or the form hooks, which pass one to their `submit` call). `packages/api` takes
  only a typed key, so a write sent without one is a type error rather than a missing header.
- **Every write to one object names the version it was made against** (`If-Match`), so a page loaded
  before somebody else saved is refused (412, with the object as it is now) rather than quietly
  overwriting what they saved. isik's `BaseModelViewSet` carries `PreconditionMixin`: reading one object
  sends its version as `ETag`, and only there - never in a body, so a list carries none, and a page
  writing to a row it listed reads that row first. Pages read it with `etagOf(response)`. The version
  is `updated_at`, which the database moves strictly forward on every write; a model without one (DOT's
  `Application`) is a `VersionedModel`. A model whose many-to-many rows a stale page could take back names
  them in `concurrency_relations` (`User`: its groups and grants), so they count toward its version
  without moving `updated_at`; `makemigrations` then adds the triggers that lock it while they change.
  A write without `If-Match` is a 428, and isik's check `isik.E007` refuses a routed write to one object
  that neither asks for it nor names a `NoPrecondition(reason=...)` - deleting a token, say, which only
  takes access away. `isik.E004` refuses one whose version no read hands out - a GET on its route, or its object's `retrieve`, that sends `ETag` - and isik raises at runtime on
  a read declared to send it that doesn't. The web forms send it through `@isikk/core`'s
  `useVersionedFormState` (with the conflict to offer: their version, or this one over it) or
  `useAPISubmit`'s `etag`; `packages/api`'s versioned writes take only `VersionedHeaders`, which a hook
  given an `etag` (or a deliberate `null`), `ifMatch()` or `anyVersion()` makes - forgetting the version,
  or passing one that may be undefined, does not compile. The `PRECONDITION_*` settings change the defaults - see isik's
  `docs/django/drf/viewsets/preconditions.md`.
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

## Testing

```
docker compose up -d --wait database{% if cookiecutter.storage != "disk" %} storage{% endif %}
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

CI restores the latest `mutants/` cache, even one from an earlier commit, and phase one runs only the
mutants that have no answer yet. That is safe only because of `scripts/mutation_cache.py`. mutmut
re-runs a mutant when its function changes, but never when the test that killed it changes. So
`prune` (before the tree is built) deletes copies whose source is gone. `invalidate` (after) clears
every kill whose killing test changed, every non-kill, and phase two's report, and makes mutmut trace
the changed tests again. A tree you keep between local runs needs the same two steps, or a kill can
outlive the test that earned it.

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
  isik's check `isik.E010` refuses to start otherwise (configured in `ISIK_CHECKS`).
- **Every opt-out names the rule it skips.** The sentinels above, `NotAtomic`, `NoIdempotencyKey`,
  `NoReplay`, `NoPrecondition` and isik's own registry opt-outs are isik `Exemption` types that refuse a reason too short
  to be one; `python manage.py exemptions` lists them by rule.
- **Serializers over a `BaseModel` list `created_at` and `updated_at`.** By hand - a sweep test in
  `apps/common/tests/test_serializer_conventions.py` checks every `apps/*/api/serializers/` module.
- **The API documents are clean and the clients match them.** `openapi-check` fails on any
  drf-spectacular warning, then checks `packages/api/src/schema.ts` is exactly what openapi-typescript
  generates from the current API, and that every endpoint the hand-written `packages/auth-api` declares
  is one allauth still serves. After changing the API, regenerate the client and commit it:
  `scripts/pre-commit/openapi_check.sh --write`.
