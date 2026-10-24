import type { Browser, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { OIDC_CONFIGURED, login, signInAtAuthentik, signUpAndVerify } from '../helpers'

// Raised and lowered from the admin, as an operator would in an incident.
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
  // Every later spec signs in as a member.
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

  // Signed out at once, not at the session's natural end.
  await page.goto('/profile/details')
  await expect(page).toHaveURL(/\/auth\/login/)

  await login(page, username, password)
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByText(/username and\/or password you specified are not correct/i)).toBeVisible()

  // The social door too, before any account is made.
  if (OIDC_CONFIGURED) {
    await page.getByRole('button', { name: 'Continue with Openid Connect' }).click()
    await signInAtAuthentik(page, 'oidc-e2e-user-4')
    await expect(page).toHaveURL('/auth/provider-error?error=logins_closed', { timeout: 30_000 })
    await expect(page.getByText('Signing in is restricted')).toBeVisible()
  }

  const lowered = await setLoginPolicy(browser, 'Everyone')
  await lowered.context().close()
  await login(page, username, password)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
