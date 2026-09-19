import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

test('changing your password while logged in requires the current one and takes effect immediately', async ({
  page,
}) => {
  const username = `change-password-${Date.now()}`
  const oldPassword = 'correct-horse-battery-staple'
  const newPassword = 'new-correct-horse-battery'
  await signUpAndVerify(page, username, `${username}@example.test`, oldPassword)
  await login(page, username, oldPassword)
  // login() doesn't itself wait for the post-submit redirect to land - most other specs never
  // need to since they read the resulting page directly, but a goto() right after can otherwise
  // race the session cookie actually being set and bounce off the next page's own auth gate.
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/password')
  await page.getByLabel('Current password').fill('definitely-the-wrong-password')
  await page.getByLabel('New password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  // allauth's own message, surfaced verbatim rather than a generic fallback.
  await expect(page.getByText('Please type your current password.')).toBeVisible()

  await page.getByLabel('Current password').fill(oldPassword)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Password changed.')).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/')

  await login(page, username, oldPassword)
  await expect(page).toHaveURL('/auth/login')
  await expect(page.getByText(/username and\/or password you specified are not correct/i)).toBeVisible()

  await login(page, username, newPassword)
  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
