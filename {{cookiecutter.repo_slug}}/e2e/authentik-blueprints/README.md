# Social-login e2e: a real, disposable Authentik instance

`oidc-test-idp.yaml` is auto-applied by Authentik on boot (mounted read-only into
`authentik-server`/`authentik-worker` - see `docker-compose.authentik-for-e2e.yml`). It provisions
one OAuth2/OpenID provider, one application, and one test user with a fixed password, so
`e2e/playwright/tests/auth/social-login.spec.ts` can click through a real OAuth redirect - browser,
IdP, and all - instead of only checking that `SOCIALACCOUNT_PROVIDERS` is well-formed.

Only relevant when `social_login_providers` includes `openid_connect` or `all` - see
`{{ cookiecutter.config_prefix }}__OAUTH__OPENID_CONNECT__*` in `e2e/.env` for the client_id/secret/
provider_id/server_url that have to match this blueprint's values exactly.

## Schema verification

The blueprint's `attrs` were verified against the real
`authentik_providers_oauth2.oauth2provider` model schema, extracted directly from the pinned image
(`ghcr.io/goauthentik/server:2026.2`) rather than assumed from documentation:

```
docker create --name schema-extract ghcr.io/goauthentik/server:2026.2
docker cp schema-extract:/blueprints/schema.json ./schema.json
docker rm schema-extract
```

The property mappings (`goauthentik.io/providers/oauth2/scope-{openid,email,profile}`) were
verified the same way, against a live instance's `GET /api/v3/propertymappings/provider/scope/` -
without them the id_token/userinfo response carries no claims beyond `sub`, allauth has no email to
extract, and the login fails silently (see "Worth knowing" below).

## Worth knowing

- **A first-ever login through this IdP does not land on a fixed page.** allauth's headless
  social-login pipeline sometimes auto-provisions the account directly from the provider's data
  (despite `SOCIALACCOUNT_AUTO_SIGNUP` being off) and lands straight on `/auth/login`; other times
  it takes the explicit pending-signup path this template builds a form for
  (`/auth/complete-signup`, see `CompleteSignupForm.tsx`), reachable only after that form is
  submitted. Both are verified-real outcomes of the same code on repeated fresh-database runs, not
  a bug in this template - `social-login.spec.ts` follows whichever one actually happens rather
  than asserting a single fixed path. If you're extending this flow, don't assume either path is
  the only one that fires.
- **`pyjwt[crypto]` is a required dependency**, not pulled in by `django-allauth` on its own unless
  installed with its `socialaccount`/`headless` extra - needed specifically for the
  `openid_connect` provider's id_token verification. Every other provider works without it; this
  is the one place a missing dependency only shows up once you actually test this specific
  provider.
- **The redirect_uri allauth builds is `/v0/provider-callback/oidc/<provider_id>/login/callback/`**
  - `oidc/` comes from allauth's own `OPENID_CONNECT_URL_PREFIX` default, and `<provider_id>` is
  whatever `{{ cookiecutter.config_prefix }}__OAUTH__OPENID_CONNECT__PROVIDER_ID` resolves to
  (`"authentik"` here) - not the literal string `"openid_connect"`. Get this wrong and Authentik
  rejects the callback with "Redirect URI Error" before your code ever runs.
