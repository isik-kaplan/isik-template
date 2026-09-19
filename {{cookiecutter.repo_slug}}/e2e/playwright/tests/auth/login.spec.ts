import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

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
