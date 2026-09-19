import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

test('logging out clears the session and returns to the anonymous home page', async ({ page }) => {
  const username = `logout-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')
  await login(page, username, 'correct-horse-battery-staple')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()

  // The session really is gone server-side, not just hidden client-side.
  await page.goto('/profile/details')
  await expect(page).toHaveURL(/\/auth\/login/)
})
