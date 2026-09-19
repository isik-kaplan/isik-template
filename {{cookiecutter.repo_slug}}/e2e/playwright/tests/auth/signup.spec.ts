import { expect, test } from '@playwright/test'

import { login } from '../helpers'
import { extractLinkFromEmail } from '../mailpit'

test('signup requires email verification before the account can log in', async ({ page }) => {
  const username = `newuser-${Date.now()}`
  const email = `${username}@example.test`
  const password = 'correct-horse-battery-staple'

  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/auth/signup-email-sent')

  // Not logged in yet - the account exists but email verification is mandatory.
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
