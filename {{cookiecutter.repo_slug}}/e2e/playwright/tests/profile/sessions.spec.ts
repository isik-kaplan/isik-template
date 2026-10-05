import { expect, test } from '@playwright/test'

import { networkInterfaces } from 'node:os'

import { login, proveWithPassword, signUpAndVerify } from '../helpers'

// This container's own address on the stack's network - what nginx sees as the caller, and so the
// address a session must be recorded under.
function ownAddress(): string {
  const addresses = Object.values(networkInterfaces()).flat()
  const external = addresses.find((address) => address && address.family === 'IPv4' && !address.internal)
  if (!external) throw new Error('this container has no external IPv4 address')
  return external.address
}

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

  // The first revocation spent the proof the login left behind, so ending the rest asks again.
  await page.getByRole('button', { name: 'Sign out 1 other device' }).click()
  await proveWithPassword(page, password)
  await expect(page).toHaveURL('/profile/sessions')
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

test('a session is recorded under the visitor\'s address, whatever X-Forwarded-For they send', async ({ page }) => {
  // Both failure modes look plausible: trusting too little records nginx's address for everyone,
  // trusting too much records whatever the client claimed.
  const spoofed = '203.0.113.9'
  const username = `sessions-xff-${Date.now()}`
  const password = 'correct-horse-battery-staple'
  await signUpAndVerify(page, username, `${username}@example.test`, password)
  // On the login request alone, where the session is recorded - set for every request, the header
  // would make each cross-subdomain fetch a CORS preflight the API never asked for.
  await page.route('**/auth/login', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': spoofed } })
  )
  await login(page, username, password)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/sessions')

  const row = page.getByRole('listitem')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(`${ownAddress()} ·`)
  await expect(row).not.toContainText(spoofed)
})
