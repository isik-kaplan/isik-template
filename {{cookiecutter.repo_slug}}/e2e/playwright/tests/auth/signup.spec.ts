import { expect, test } from '@playwright/test'

import { login, submitSignup } from '../helpers'
import { extractLinkFromEmail } from '../mailpit'

test('signup requires email verification before the account can log in', async ({ page }) => {
  const username = `newuser-${Date.now()}`
  const email = `${username}@example.test`
  const password = 'correct-horse-battery-staple'

  await submitSignup(page, username, email, password)

  // Not logged in yet: email verification is mandatory.
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()

  const verifyLink = await extractLinkFromEmail(email, '/auth/verify-email/')
  await page.goto(verifyLink)
  await page.getByRole('button', { name: 'Confirm email address' }).click()
  await expect(page).toHaveURL('/auth/login')

  await login(page, username, password)

  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
