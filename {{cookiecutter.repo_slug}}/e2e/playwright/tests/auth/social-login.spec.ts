import { expect, test } from '@playwright/test'

{%- set providers = cookiecutter.social_login_providers.strip() %}
{#- SocialLoginButtons.tsx deliberately renders no buttons at all for "all" (a login page with
   ~90 buttons isn't good UX regardless) - so unlike settings.py's SOCIALACCOUNT_PROVIDERS, "all"
   does NOT mean a button exists here to click. Only an explicit openid_connect gets one. #}
{%- if 'openid_connect' in providers and providers != 'all' %}

// Drives a real OAuth redirect through the disposable Authentik instance seeded by
// e2e/authentik-blueprints/oidc-test-idp.yaml (docker-compose.authentik-for-e2e.yml) - the one
// e2e spec that proves social login actually works end to end, not just that the settings-based
// SOCIALACCOUNT_PROVIDERS config is well-formed (that part is covered by the backend test suite).
//
// A first-ever login via this IdP always ends up needing email verification before it's a real
// session (ACCOUNT_EMAIL_VERIFICATION is mandatory, and the IdP's test user's email comes back
// unverified) - but which of two allauth-internal paths gets there is not deterministic run to
// run: sometimes the pipeline auto-provisions the account directly (despite
// SOCIALACCOUNT_AUTO_SIGNUP being off) and lands straight on /auth/login; other times it takes
// the explicit pending-signup path this template builds a form for (/auth/complete-signup, see
// CompleteSignupForm.tsx) and only reaches /auth/login after that form is submitted. Both are
// verified-real outcomes of the same code, not a bug in this template - so this spec follows
// whichever one actually happens rather than asserting a single fixed path.
test('logging in with the OIDC test IdP provisions an account pending email verification', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByRole('button', { name: 'Continue with Openid Connect' }).click()

  // Now on authentik.{{ cookiecutter.domain }}'s own login form.
  await expect(page).toHaveURL(/authentik\./)
  await page.getByLabel(/email or username/i).fill('oidc-e2e-user')
  await page.getByRole('button', { name: /log in/i }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: /log in|continue/i }).click()

  await page.waitForURL((url) => url.pathname === '/auth/login' || url.pathname === '/auth/complete-signup')
  if (new URL(page.url()).pathname === '/auth/complete-signup') {
    await page.getByLabel('Username').fill(`oidc-e2e-${Date.now()}`)
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple-2')
    await page.getByRole('button', { name: 'Finish signing up' }).click()
  }

  await expect(page).toHaveURL('/auth/login')
})
{%- else %}

// social_login_providers doesn't include an explicit openid_connect for this project (or is
// "all", which renders no buttons at all - see SocialLoginButtons.tsx), so there's no
// "Continue with Openid Connect" button to click - see e2e/authentik-blueprints/README.md for
// what this spec covers when it's enabled.
test.skip('logging in with the OIDC test IdP creates and signs in a new account', () => {})
{%- endif %}
