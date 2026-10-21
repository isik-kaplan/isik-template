{%- set extra_languages = cookiecutter.languages.split(',')[1:] | map('trim') | list -%}
# Setting up {{ cookiecutter.project_name }}

Everything to do after generating this project, in order. The [README](README.md) explains how the pieces work;
this is the checklist.

- [ ] [Reach the app on its domain](#1-reach-the-app-on-its-domain)
- [ ] [Write `.env`](#2-write-env)
- [ ] [Sign in as the first superuser](#3-sign-in-as-the-first-superuser)
- [ ] [DNS and TLS](#4-dns-and-tls)
- [ ] [Social login providers](#5-social-login-providers) (optional)
- [ ] [Email, storage and error reporting](#6-email-storage-and-error-reporting)
- [ ] [Legal documents](#7-legal-documents)
- [ ] [Cookies and consent](#8-cookies-and-consent)
{%- if extra_languages %}
- [ ] [Translations](#9-translations)
{%- endif %}
{%- if cookiecutter.include_mobile %}
- [ ] [The mobile app](#10-the-mobile-app)
{%- endif %}

## 1. Reach the app on its domain

Session and CSRF cookies are shared across `api.`, `admin.` and `auth.{{ cookiecutter.domain }}`, so the app needs a
real registrable domain and is never served at plain `localhost`. Locally, add to `/etc/hosts`:

```
127.0.0.1 {{ cookiecutter.domain }} api.{{ cookiecutter.domain }} admin.{{ cookiecutter.domain }} auth.{{ cookiecutter.domain }}
```

Then `docker compose build && docker compose up -d`, and open
{% if cookiecutter.tls_termination == "self" %}`https://{{ cookiecutter.domain }}`{% else %}`http://{{ cookiecutter.domain }}`{% endif %}.

## 2. Write `.env`

Generation already ran `scripts/setup.sh` once. Without a terminal it copied `.env.example`, whose values work for
local development as they are. Rerun it whenever the checkout's purpose changes:

```
bash scripts/setup.sh
```

- **Local development** keeps `.env.example`'s values.
- **A real deployment** generates strong secrets (`SECRET_KEY`, `CREDENTIAL_KEY`, `FRONTEND_KEY`, the
  database{% if cookiecutter.background_jobs != "inline" %}, broker{% endif %}{% if cookiecutter.cache == "redis" %}, cache{% endif %} and superuser
  passwords) and asks for the domain, SMTP, object storage, social login credentials and Sentry.

Every variable is documented where it is set, in `.env.example`'s own comments. Keep `.env` out of version control.

## 3. Sign in as the first superuser

Every backend start runs `manage.py setup`, which creates a superuser from
`{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__*` when none exists yet. Locally that is `admin` /
`admin-change-me`; a deployment's `setup.sh` run prints a generated password once. Sign in at
`https://admin.{{ cookiecutter.domain }}/` (or `http://` locally) and change the password straight away. Another one
can be made by hand with:

```
docker compose run --rm backend python manage.py createsuperuser
```

## 4. DNS and TLS
{% if cookiecutter.tls_termination == "self" %}
This project terminates its own TLS through the `certbot` service. Before the first `docker compose up -d` on a
server, point `{{ cookiecutter.domain }}`, `api.`, `admin.` and `auth.{{ cookiecutter.domain }}` at its public IP: Let's Encrypt's HTTP-01
challenge needs them resolving, and until it succeeds nginx serves a throwaway self-signed certificate. Ports `80` and
`443` must reach the host directly. `{{ cookiecutter.config_prefix }}__TLS__ACME_EMAIL` receives Let's Encrypt's expiry notices. The
README's "TLS" section has the details.
{% else %}
This project serves plain HTTP and expects a TLS-terminating load balancer or reverse proxy in front of it. Point the
four names (`{{ cookiecutter.domain }}`, `api.`, `admin.`, `auth.`) at that proxy, have it forward to the `server` container
with `X-Forwarded-Proto` and `X-Forwarded-Host` set, and append to `X-Forwarded-For` rather than replace it.
`{{ cookiecutter.config_prefix }}__TRUSTED_PROXY_COUNT` counts the proxies (2 behind one load balancer, which
`setup.sh` writes). The README's "TLS" section explains why each of these matters, and how to get local HTTPS for
passkeys with `scripts/dev-tls.sh`.
{% endif %}

## 5. Social login providers

Optional: with none configured, sign-in is email and password only. To offer some, list their allauth
provider ids in `{{ cookiecutter.config_prefix }}__SOCIAL_LOGIN__PROVIDERS`, e.g. `google,github`. The backend and the web
frontend both read it at startup, so adding one later is a change to `.env` and a restart, not to the
code. Startup refuses an id allauth doesn't ship.

Then register an OAuth application with each provider and put its credentials in `.env` (`setup.sh`
asks for both). A provider without credentials still shows its button, but its flow cannot complete.

- **Most providers**: `{{ cookiecutter.config_prefix }}__OAUTH__<ID>__CLIENT_ID` and `..._CLIENT_SECRET`, `<ID>` being the
  provider id upper-cased. Redirect URI: `https://auth.{{ cookiecutter.domain }}/v0/provider-callback/<id>/login/callback/`.
- **openid_connect** (your own identity provider) also needs `..._SERVER_URL` (the issuer) and
  `..._PROVIDER_ID`. Redirect URI:
  `https://auth.{{ cookiecutter.domain }}/v0/provider-callback/oidc/<PROVIDER_ID>/login/callback/`. The frontend
  has no brand icon for it; `{{ cookiecutter.config_prefix }}__SOCIAL_LOGIN__ICONS=openid_connect=<url or path>`
  gives it one.

Use `http://` in the redirect URI for a local stack without TLS. A first sign-in through a provider lands on a
"finish signing up" page, where the person confirms a username and sees the legal documents they agree to.

### Other apps signing in with this one

The other direction, also optional: this project as an OAuth 2.0 / OpenID Connect provider, so other apps offer
"Sign in with {{ cookiecutter.project_name }}". Anybody signed in registers their own app, up to
`..._APPLICATIONS_PER_USER` (10), and `{{ cookiecutter.config_prefix }}__OAUTH_PROVIDER__MODE` decides what happens next:

- **off** (the default): nothing of it is served.
- **approval**: a new app waits until a superuser approves it, at `/staff/applications`, and with it which of the
  permissions it asked for it may ask people for.
- **auto**: a new app is approved for everything it asks for the moment it is registered.

Any mode but off needs `{{ cookiecutter.config_prefix }}__OAUTH_PROVIDER__SIGNING_KEY`, the RSA key id_tokens are signed with
(`setup.sh` generates one). An app is pointed at the discovery document,
`https://auth.{{ cookiecutter.domain }}/o/.well-known/openid-configuration`, and uses the authorization code flow with PKCE -
or, registered as a device, shows people a code to enter at `https://{{ cookiecutter.domain }}/device`, the way a command
line signs in. Every person is asked once, on this project's own page, before an app sees anything, and can take that
back from their profile.

Personal access tokens need none of this: whatever the mode, anybody signed in can make one for their own scripts on
the profile's Tokens tab.

## 6. Email, storage and error reporting

- **Email.** With `DEBUG=true` mail is printed to the backend's log. A deployment needs
  `{{ cookiecutter.config_prefix }}__EMAIL__SMTP__*`, or verification and password reset links go nowhere.
{%- if cookiecutter.storage == "garage" %}
- **Object storage.** Uploads go to the bundled Garage, on the `storage_data` volume. Back it up;
  `setup.sh` generated its keys.
{%- elif cookiecutter.storage == "s3" %}
- **Object storage.** Point `{{ cookiecutter.config_prefix }}__STORAGE__*` at your S3 provider and create
  the bucket, and leave `COMPOSE_PROFILES` without `local-storage` so the bundled Garage stays off.
{%- else %}
- **Object storage.** Uploads go to disk, on the `media` volume. Back it up.
{%- endif %}
- **Error reporting.** `{{ cookiecutter.config_prefix }}__SENTRY__DSN` (backend) and `NEXT_PUBLIC_SENTRY_DSN`
  (browser, read at build time) switch Sentry on. Neither sets a cookie.

## 7. Legal documents

The site renders a page per legal document at `/legal/<slug>`, links them from every page's footer, and tells every
signup, by password or social login, that continuing means agreeing to them. It ships no legal text: you add it.

**Which documents.** `{{ cookiecutter.project_slug }}-frontend/apps/web/src/legal/documents.json` lists them, and is the one
list the pages, the footer, the signup line and the version hash read. For each slug it names, write:

```
{{ cookiecutter.project_slug }}-frontend/apps/web/src/legal/en/<slug>.md
```

The bake's last message named each file at its exact path. To list the ones still missing:

```
node {{ cookiecutter.project_slug }}-frontend/apps/web/scripts/check-legal-documents.mjs
```

The same check runs before every production build and warns about each missing file. Until a document exists, its
page says it has not been added yet rather than failing.
{%- if extra_languages %}
Translations go beside it, as `legal/<language>/<slug>.md` for {{ extra_languages | join(', ') }}; a visitor whose language has no
translation sees the English text, with a note saying so.
{%- endif %}

**Writing them.** Plain Markdown, GitHub-flavoured (tables work). Don't write a cookie section into the privacy
policy: its page adds one generated from the site's real cookie list (see the next step).

**Drafting them with a generator.** `bash scripts/generate-legal.sh` drafts the privacy policy and the terms of
service from this project's answers with
[app-privacy-policy-generator](https://github.com/nisrulz/app-privacy-policy-generator). That project is AGPL-3.0, so
the script fetches a pinned copy into a temporary directory and drives its page in a headless browser there; none of
its code enters this repository. It needs Docker, and when it cannot run it tells you
how to use the [hosted generator](https://app-privacy-policy-generator.nisrulz.com/) by hand instead. A generated policy
describes a generic app, not this one: read it, fill in what it leaves generic, and have it reviewed by someone
qualified before launch.

**What a signup records.** Each new account stores `terms_version` (a hash of every document file) and
`terms_accepted_at`, both visible on the user's admin page. Accounts created while no document exists record neither,
since there was nothing to agree to. The `legal-version` pre-commit hook rewrites `apps/users/terms.py` whenever a
document changes; stage that file with the documents. Asking existing users to accept a new version is left for the
day a project needs it: compare their `terms_version` with the current one.

## 8. Cookies and consent

Everything the site stores in a browser is strictly necessary (the session and CSRF cookies) or remembers a choice
the visitor made (the theme, in local storage). That needs disclosing, not consenting to, so there is no consent
banner: the footer has a one-line disclosure linking to the privacy policy's cookies section, which is rendered from
`{{ cookiecutter.project_slug }}-frontend/apps/web/src/legal/storage.json`.

Keep that list true. The e2e suite signs up, signs in and walks the app, then fails if the browser holds a cookie or
storage key the list leaves out. Adding analytics, ads, embeds or anything else non-essential changes the rules: the
README's "Legal pages and cookies" section describes what to add first.
{%- if extra_languages %}

## 9. Translations

Every string is authored in English. Fill in the catalogs generation scaffolded for
{{ extra_languages | join(', ') }}: the backend's `locale/<language>/LC_MESSAGES/django.po`, the web app's
`locales/<language>/*.json`{% if cookiecutter.include_mobile %}, the mobile app's `lib/locales/<language>.json`{% endif %} and any legal
document translations. The README's "Translations" section has the commands.
{%- endif %}
{%- if cookiecutter.include_mobile %}

## 10. The mobile app

`{{ cookiecutter.project_slug }}-frontend/apps/mobile` runs outside the compose stack, pointed at the backend by
`EXPO_PUBLIC_API_ORIGIN` and `EXPO_PUBLIC_AUTH_ORIGIN`; its signup screens link to the web app's legal pages, on the
auth origin's parent domain. The README's mobile section covers running it on a simulator or device and the native
Google and Apple sign-in credentials it needs.
{%- endif %}
