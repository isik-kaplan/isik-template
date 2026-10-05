import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'
import { extractLinkFromEmail, waitForEmailCount } from '../mailpit'

test('logging in with the wrong password shows an error and does not sign in', async ({ page }) => {
  const username = `login-wrong-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')

  await login(page, username, 'definitely-the-wrong-password')

  await expect(page).toHaveURL('/auth/login')
  // allauth's own message, surfaced verbatim by LoginForm rather than a generic fallback - it
  // comes back with param: "password", so it renders under the password field, not as a banner.
  await expect(page.getByText(/username and\/or password you specified are not correct/i)).toBeVisible()
})

test('logging in by email works the same as by username', async ({ page }) => {
  const username = `login-email-${Date.now()}`
  const email = `${username}@example.test`
  await signUpAndVerify(page, username, email, 'correct-horse-battery-staple')

  await login(page, email, 'correct-horse-battery-staple')

  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})

test('the right password for an unconfirmed address asks for the confirmation, not the password', async ({
  page,
}) => {
  const username = `login-unconfirmed-${Date.now()}`
  const email = `${username}@example.test`
  const password = 'correct-horse-battery-staple'
  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/auth/signup-email-sent')
  await waitForEmailCount(email, 1)

  await login(page, username, password)

  await expect(page).toHaveURL('/auth/verify-email-required')
  await expect(page.getByText('Confirm your email address first')).toBeVisible()
  await expect(page.getByText('Could not log you in.')).toHaveCount(0)
  // allauth mails a fresh link as it refuses the login, which is what the page promises.
  await waitForEmailCount(email, 2)
  await page.goto(await extractLinkFromEmail(email, '/auth/verify-email/'))
  await page.getByRole('button', { name: 'Confirm email address' }).click()
  await expect(page).toHaveURL('/auth/login')

  await login(page, username, password)

  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
