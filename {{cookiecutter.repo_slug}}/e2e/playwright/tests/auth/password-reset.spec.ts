import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'
import { extractLinkFromEmail } from '../mailpit'

test('forgot password sends a reset link that lets you set a new password and log in with it', async ({ page }) => {
  const username = `reset-${Date.now()}`
  const email = `${username}@example.test`
  const oldPassword = 'correct-horse-battery-staple'
  const newPassword = 'new-correct-horse-battery'
  await signUpAndVerify(page, username, email, oldPassword)

  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page).toHaveURL('/auth/password-reset-email-sent')

  const resetLink = await extractLinkFromEmail(email, '/auth/password-reset/')
  await page.goto(resetLink)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page).toHaveURL('/auth/login')

  // The old password no longer works.
  await login(page, username, oldPassword)
  await expect(page).toHaveURL('/auth/login')
  // allauth's own message (see login.spec.ts) - renders under the password field, not as a banner.
  await expect(page.getByText(/username and\/or password you specified are not correct/i)).toBeVisible()

  // The new one does.
  await login(page, username, newPassword)
  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
