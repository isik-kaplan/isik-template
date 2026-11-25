import type { Browser, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  ADMIN,
  LOGIN_LABEL,
  OIDC_CONFIGURED,
  SUPERUSER_PASSWORD,
  act,
  login,
  signInAtAuthentik,
  signInToAdmin,
  signUpAndVerify,
} from '../helpers'

// Raised and lowered from the admin, as an operator would in an incident.
async function setLoginPolicy(browser: Browser, policy: string): Promise<Page> {
  const page = await signInToAdmin(browser)
  await page.goto(`${ADMIN}/settings`)
  // Changing who may sign in asks the superuser to prove it is them, unless they just did.
  const saved = page.getByText(/^Saved\. \d+ sessions? signed out\.$/)
  await act(
    page,
    SUPERUSER_PASSWORD,
    async () => {
      await page.getByRole('radio', { name: policy }).check()
      await page.getByRole('button', { name: 'Save' }).click()
    },
    saved
  )
  await expect(saved).toBeVisible()
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
  await expect(admin.getByText(/^Saved\. [1-9]\d* sessions? signed out\.$/)).toBeVisible()
  await admin.context().close()

  // Signed out at once, not at the session's natural end.
  await page.goto('/profile/details')
  await expect(page).toHaveURL(/\/auth\/login/)
  // The URL changes before the redirect settles; navigating again any sooner gets aborted.
  await expect(page.getByLabel(LOGIN_LABEL)).toBeVisible()

  await login(page, username, password)
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByText(/username and\/or password you specified are not correct/i)).toBeVisible()

  // The social door too, before any account is made.
  if (OIDC_CONFIGURED) {
    await page.getByRole('button', { name: 'Continue with Authentik' }).click()
    await signInAtAuthentik(page, 'oidc-e2e-user-4')
    await expect(page).toHaveURL('/auth/provider-error?error=logins_closed', { timeout: 30_000 })
    await expect(page.getByText('Signing in is restricted')).toBeVisible()
  }

  const lowered = await setLoginPolicy(browser, 'Everyone')
  await lowered.context().close()
  await login(page, username, password)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})
