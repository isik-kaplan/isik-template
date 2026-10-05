{%- set providers = cookiecutter.social_login_providers.strip() -%}
{%- set oidc = 'openid_connect' in providers and providers != 'all' -%}
import type { Browser, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { login, {% if oidc %}signInAtAuthentik, {% endif %}signUpAndVerify } from '../helpers'

// The graduated "who may still sign in" switch, raised and lowered the way an operator does it in an
// incident: from the admin, as the seeded superuser (SETUP__SUPERUSER__*, see docker-compose.e2e.yml).
const ADMIN = 'http://admin.{{ cookiecutter.domain }}'
const SUPERUSER = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__USERNAME ?? ''
const SUPERUSER_PASSWORD = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__PASSWORD ?? ''

async function setLoginPolicy(browser: Browser, policy: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${ADMIN}/`)
  await page.getByLabel('Username').fill(SUPERUSER)
  await page.getByLabel('Password').fill(SUPERUSER_PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(`${ADMIN}/`)
  await page.goto(`${ADMIN}/users/sitesettings/`)
  await page.locator('select[name="login_policy"]').selectOption({ label: policy })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.messagelist')).toBeVisible()
  return page
}

test.afterEach(async ({ browser }) => {
  // Whatever happened above, the ladder comes back down - every later spec signs in as a member.
  const page = await setLoginPolicy(browser, 'Everyone')
  await page.context().close()
})

test('raising the ladder signs out and shuts out whoever it excludes, on both doors, until it comes down', async ({
  page,
  browser,
}) => {
  const username = `ladder-${Date.now()}`
  const password = 'correct-horse-battery-staple'
  await signUpAndVerify(page, username, `${username}@example.test`, password)
  await login(page, username, password)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  const admin = await setLoginPolicy(browser, 'Staff and superusers')
  await expect(admin.getByText(/\d+ sessions? signed out\./)).toBeVisible()
  await admin.context().close()

  // Signed out straight away, not at the session's natural end.
  await page.goto('/profile/details')
  await expect(page).toHaveURL(/\/auth\/login/)

  await login(page, username, password)
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByText(/username and\/or password you specified are not correct/i)).toBeVisible()
{%- if oidc %}

  // The social door answers to the same ladder, before any account is made.
  await page.getByRole('button', { name: 'Continue with Openid Connect' }).click()
  await signInAtAuthentik(page, 'oidc-e2e-user-4')
  await expect(page).toHaveURL('/auth/provider-error?error=logins_closed', { timeout: 30_000 })
  await expect(page.getByText('Signing in is restricted')).toBeVisible()
{%- endif %}

  const lowered = await setLoginPolicy(browser, 'Everyone')
  await lowered.context().close()
  await login(page, username, password)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
