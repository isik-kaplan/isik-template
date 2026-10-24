import type { Browser, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { extractLinkFromEmail } from './mailpit'

/** The same variable the app's containers get, so social specs run exactly when there is a button. */
export const OIDC_CONFIGURED = (process.env.{{ cookiecutter.config_prefix }}__SOCIAL_LOGIN__PROVIDERS ?? '')
  .split(',')
  .some((provider) => provider.trim() === 'openid_connect')

/** Through the real UI rather than seeded, so a broken signup fails every spec that needs a user. */
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
  // exact: a substring match also catches the "Show password" toggle.
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function proveWithPassword(page: Page, password: string) {
  await expect(page).toHaveURL(/\/auth\/prove\?/)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page).not.toHaveURL(/\/auth\/prove/)
}

export async function signInAtAuthentik(page: Page, username: string) {
  await expect(page).toHaveURL(/authentik\./)
  await page.getByLabel(/email or username/i).fill(username)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: /log in|continue/i }).click()
}

export const SUPERUSER = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__USERNAME ?? ''
export const SUPERUSER_PASSWORD = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__PASSWORD ?? ''

/** Proves only if the gate asks: a proof from moments ago may still be unspent. */
export async function act(page: Page, password: string, perform: () => Promise<void>, done: Locator) {
  await perform()
  await expect
    .poll(async () => page.url().includes('/auth/prove') || (await done.isVisible()))
    .toBe(true)
  if (page.url().includes('/auth/prove')) {
    await proveWithPassword(page, password)
    await perform()
  }
  await expect(done).toBeVisible()
}

export async function asTheSuperuser(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
  await login(page, SUPERUSER, SUPERUSER_PASSWORD)
  await expect(page.getByText(`Signed in as ${SUPERUSER}.`)).toBeVisible()
  return page
}
