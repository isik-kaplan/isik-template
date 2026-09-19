import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

test('revoking a single session and revoking the rest both end those sessions for real', async ({ page, browser }) => {
  const username = `sessions-${Date.now()}`
  const password = 'correct-horse-battery-staple'
  await signUpAndVerify(page, username, `${username}@example.test`, password)
  await login(page, username, password)
  // login() doesn't itself wait for the post-submit redirect - each of these needs to wait for
  // its own since the very next thing either reads the session list (which would race the cookie
  // actually being set) or is itself another login sharing the same "Signed in as" text.
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  // Two more logins as the same user, each its own cookie jar - three real sessions server-side.
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await login(pageB, username, password)
  await expect(pageB.getByText(`Signed in as ${username}.`)).toBeVisible()

  const contextC = await browser.newContext()
  const pageC = await contextC.newPage()
  await login(pageC, username, password)
  await expect(pageC.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/sessions')
  const rows = page.getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Sign out 2 other devices' })).toBeVisible()

  const others = rows.filter({ hasNotText: 'This device' })
  await others.first().getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('Signed out of that device.')).toBeVisible()
  await expect(rows).toHaveCount(2)

  await page.getByRole('button', { name: 'Sign out 1 other device' }).click()
  await expect(page.getByText('Signed out of all other devices.')).toBeVisible()
  await expect(rows).toHaveCount(1)
  await expect(page.getByRole('button', { name: /Sign out \d+ other device/ })).not.toBeVisible()

  // The revoked sessions are gone server-side, not just hidden in this tab's view of the list.
  await pageB.goto('/profile/details')
  await expect(pageB).toHaveURL(/\/auth\/login/)
  await pageC.goto('/profile/details')
  await expect(pageC).toHaveURL(/\/auth\/login/)

  await contextB.close()
  await contextC.close()
})
