import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { extractLinkFromEmail } from './mailpit'

/** Signs up and verifies a brand-new account through the real UI - every other spec that needs a
 * logged-in-capable user builds on this rather than seeding one out of band, so a break in signup
 * or verification shows up immediately in whatever spec runs after it, not silently. */
export async function signUpAndVerify(page: Page, username: string, email: string, password: string) {
  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/auth/signup-email-sent')

  const verifyLink = await extractLinkFromEmail(email, '/auth/verify-email/')
  await page.goto(verifyLink)
  await page.getByRole('button', { name: 'Confirm email address' }).click()
  await expect(page).toHaveURL('/auth/login')
}

export async function login(page: Page, login: string, password: string) {
  await page.goto('/auth/login')
  await page.getByLabel('Username or email').fill(login)
  // exact: true - a bare substring match also catches the show/hide toggle's "Show password"
  // accessible label.
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}
