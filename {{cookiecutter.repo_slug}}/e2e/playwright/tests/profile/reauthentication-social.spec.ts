import { expect, test } from '@playwright/test'

import { OIDC_CONFIGURED, login, proveWithPassword, signInAtAuthentik } from '../helpers'
import { extractLinkFromEmail } from '../mailpit'

// A passwordless account proves itself by signing in again at the IdP, whose auth_time must postdate the gate.
const IDENTITY = 'oidc-e2e-user-3'
const IDENTITY_EMAIL = 'oidc-e2e-user-3@example.com'

test.skip(!OIDC_CONFIGURED, 'SOCIAL_LOGIN__PROVIDERS does not name openid_connect, so there is no button to press')

test('somebody with no password proves it at their provider, and can set a password by email instead', async ({
  page,
}) => {
  // Either signup path can happen, as in auth/social-login.spec.ts.
  await page.goto('/auth/login')
  await page.getByRole('button', { name: 'Continue with Openid Connect' }).click()
  await signInAtAuthentik(page, IDENTITY)
  const landed = (...paths: string[]) => page.waitForURL((url) => paths.includes(url.pathname))
  await landed('/', '/auth/login', '/auth/complete-signup')
  if (new URL(page.url()).pathname === '/auth/complete-signup') {
    await page.getByLabel('Username').fill(`oidc-reauth-${Date.now()}`)
    await page.getByLabel('Password', { exact: true }).fill('ignored-by-a-social-signup')
    await page.getByRole('button', { name: 'Finish signing up' }).click()
    await landed('/', '/auth/login')
  }
  if (new URL(page.url()).pathname === '/auth/login') {
    const verifyLink = await extractLinkFromEmail(IDENTITY_EMAIL, '/auth/verify-email/')
    await page.goto(verifyLink)
    await page.getByRole('button', { name: 'Confirm email address' }).click()
    // A retry finds the address it verified the first time already confirmed, and is told so.
    await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith('/auth/verify-email')),
      page.getByText('That verification link is no longer valid.').waitFor(),
    ])
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with Openid Connect' }).click()
  }
  await expect(page.getByText(/Signed in as/)).toBeVisible()

  // A social sign-in is not a proof: the provider may well have signed them in without asking.
  await page.goto('/profile/emails')
  await page.getByPlaceholder('Email').fill(`oidc-reauth-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page).toHaveURL('/auth/prove?next=%2Fprofile%2Femails')
  await expect(page.getByRole('button', { name: 'Confirm with OpenID Connect' })).toBeVisible()
  // A retry meets the password its first attempt set below, so there is nothing left to show.
  if (await page.getByLabel('Password', { exact: true }).isVisible()) {
    await proveWithPassword(page, 'a-password-set-by-email')
    await expect(page).toHaveURL('/profile/emails')
    return
  }

  await page.getByRole('button', { name: 'Confirm with OpenID Connect' }).click()
  // prompt=login: the provider asks again even though its own session is still open.
  await signInAtAuthentik(page, IDENTITY)
  // Two server round trips: the provider's callback and the prove page.
  await expect(page).toHaveURL('/profile/emails', { timeout: 30_000 })

  const added = `oidc-reauth-added-${Date.now()}@example.test`
  await page.getByPlaceholder('Email').fill(added)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: added })).toBeVisible()

  // Spent: the next act asks again - and this time takes the way back by email.
  await page.getByPlaceholder('Email').fill(`oidc-reauth-next-${Date.now()}@example.test`)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page).toHaveURL(/\/auth\/prove/)
  await page.getByRole('button', { name: 'Email me a link to set a password' }).click()
  await expect(page.getByText(`We sent a link to ${IDENTITY_EMAIL}.`, { exact: false })).toBeVisible()

  const resetLink = await extractLinkFromEmail(IDENTITY_EMAIL, '/auth/password-reset/')
  await page.goto(resetLink)
  await page.getByLabel('New password').fill('a-password-set-by-email')
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page).not.toHaveURL(/password-reset/)

  // A new password ends the old sessions; the account now proves the ordinary way.
  await login(page, IDENTITY_EMAIL, 'a-password-set-by-email')
  await expect(page.getByText(/Signed in as/)).toBeVisible()
  await page.goto('/profile/emails')
  const afterwards = `oidc-reauth-after-${Date.now()}@example.test`
  await page.getByPlaceholder('Email').fill(afterwards)
  await page.getByRole('button', { name: 'Add email' }).click()
  await proveWithPassword(page, 'a-password-set-by-email')
  await expect(page).toHaveURL('/profile/emails')
  await page.getByPlaceholder('Email').fill(afterwards)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: afterwards })).toBeVisible()
})
