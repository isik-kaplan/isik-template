import type { Browser, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { extractLinkFromEmail } from './mailpit'

/** Whether the stack under test offers the OIDC test IdP (e2e/.env names it in
 * SOCIAL_LOGIN__PROVIDERS) - read from the same variable the app's own containers are configured
 * with, so the social specs run exactly when there is a button for them to press. */
export const OIDC_CONFIGURED = (process.env.{{ cookiecutter.config_prefix }}__SOCIAL_LOGIN__PROVIDERS ?? '')
  .split(',')
  .some((provider) => provider.trim() === 'openid_connect')

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

/** Answers the prove page an act sends somebody to with their password, and waits to be sent back. */
export async function proveWithPassword(page: Page, password: string) {
  await expect(page).toHaveURL(/\/auth\/prove\?/)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page).not.toHaveURL(/\/auth\/prove/)
}

/** Signs in on the disposable Authentik instance's own login form (e2e/authentik-blueprints). */
export async function signInAtAuthentik(page: Page, username: string) {
  await expect(page).toHaveURL(/authentik\./)
  await page.getByLabel(/email or username/i).fill(username)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: /log in|continue/i }).click()
}

// The seeded superuser (SETUP__SUPERUSER__*, see docker-compose.e2e.yml), who approves applications here.
export const SUPERUSER = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__USERNAME ?? ''
export const SUPERUSER_PASSWORD = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__PASSWORD ?? ''

/** Does an act, proving it is them first if the gate asks - a sign-in moments ago can count as the proof. */
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

/** A browser of the seeded superuser's own, signed in. */
export async function asTheSuperuser(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
  await login(page, SUPERUSER, SUPERUSER_PASSWORD)
  await expect(page.getByText(`Signed in as ${SUPERUSER}.`)).toBeVisible()
  return page
}
