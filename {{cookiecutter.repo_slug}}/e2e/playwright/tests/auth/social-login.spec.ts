import { expect, test } from '@playwright/test'

import { OIDC_CONFIGURED } from '../helpers'

test.skip(!OIDC_CONFIGURED, 'SOCIAL_LOGIN__PROVIDERS does not name openid_connect, so there is no button to press')

const AUTHORIZE_PATH = '/application/o/authorize/'

// allauth nondeterministically either provisions the account directly or goes through
// /auth/complete-signup first; both end on /auth/login, so the spec follows whichever happens.
test('logging in with the OIDC test IdP provisions an account pending email verification', async ({ page }) => {
  await page.goto('/auth/login')
  const scheme = new URL(page.url()).protocol
  const authorize = page.waitForRequest((request) => new URL(request.url()).pathname === AUTHORIZE_PATH)
  await page.getByRole('button', { name: 'Continue with Openid Connect' }).click()

  // allauth builds redirect_uri from the forwarded scheme; behind a TLS proxy it must stay https.
  const redirectUri = new URL((await authorize).url()).searchParams.get('redirect_uri') ?? ''
  expect(new URL(redirectUri).protocol).toBe(scheme)

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
