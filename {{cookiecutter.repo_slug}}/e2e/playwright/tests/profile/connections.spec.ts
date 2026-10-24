import { expect, test } from '@playwright/test'

import { OIDC_CONFIGURED, login, proveWithPassword, signUpAndVerify } from '../helpers'

test.skip(!OIDC_CONFIGURED, 'SOCIAL_LOGIN__PROVIDERS does not name openid_connect, so there is no button to press')

// A retry finds its identity already linked to its first attempt's account, which allauth silently
// refuses to link again, so the spec follows either outcome.
test('connecting the OIDC test IdP either links it and can be undone, or is silently refused as already linked', async ({
  page,
}) => {
  const username = `connections-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')
  await login(page, username, 'correct-horse-battery-staple')
  // login() doesn't wait for the redirect; a goto() right after would race the session cookie.
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/connections')
  const oidcRow = page.getByRole('listitem').filter({ hasText: 'Openid Connect' })
  await expect(oidcRow.getByText('Not connected')).toBeVisible()

  // exact: "Connected" is a substring of "Not connected", and "Connect" of "Disconnect".
  // Signing in is not a proof, so connecting asks for one first and comes back to finish.
  await oidcRow.getByRole('button', { name: 'Connect', exact: true }).click()
  await proveWithPassword(page, 'correct-horse-battery-staple')
  await expect(page).toHaveURL('/profile/connections')
  await oidcRow.getByRole('button', { name: 'Connect', exact: true }).click()

  await expect(page).toHaveURL(/authentik\./)
  await page.getByLabel(/email or username/i).fill('oidc-e2e-user-2')
  await page.getByRole('button', { name: /log in/i }).click()
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple')
  await page.getByRole('button', { name: /log in|continue/i }).click()

  await page.waitForURL((url) => url.pathname === '/profile/connections')

  // A refused connect shows nothing, so "Connected" not appearing within a beat is the signal.
  const connectedWithinABeat = await oidcRow
    .getByText('Connected', { exact: true })
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false)

  if (!connectedWithinABeat) {
    await expect(oidcRow.getByText('Not connected')).toBeVisible()
    return
  }

  // Connecting spent its proof, so disconnecting asks again.
  await oidcRow.getByRole('button', { name: 'Disconnect' }).click()
  await proveWithPassword(page, 'correct-horse-battery-staple')
  await oidcRow.getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByText('Account disconnected.')).toBeVisible()
  await expect(oidcRow.getByText('Not connected')).toBeVisible()
})
