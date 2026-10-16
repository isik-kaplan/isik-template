import { expect, test } from '@playwright/test'

import { OIDC_CONFIGURED, login, proveWithPassword, signUpAndVerify } from '../helpers'

test.skip(!OIDC_CONFIGURED, 'SOCIAL_LOGIN__PROVIDERS does not name openid_connect, so there is no button to press')

// Drives the real OIDC test IdP (see auth/social-login.spec.ts), through the profile page's own
// "Connect" button rather than the login page's, so this exercises AutoFormButton/ConnectionsList
// specifically. Uses its own dedicated identity (oidc-e2e-user-2, see
// e2e/authentik-blueprints/oidc-test-idp.yaml) rather than social-login.spec.ts's oidc-e2e-user -
// sharing one identity meant whichever spec ran second saw a returning, already-linked login
// instead of a first-ever one, breaking that spec's own assumptions. A retry of this exact spec can
// still hit that state against its own identity though (allauth correctly refuses to link an
// already-linked social identity to a second local account), so this still follows whichever
// outcome actually happens rather than assuming a single one: a refusal comes back as a real
// redirect to this same page with ?error=connected_other&error_process=connect on the URL -
// ConnectionsList doesn't read that param, so the visible outcome is just the row staying
// "Not connected" with no explanation shown.
test('connecting the OIDC test IdP either links it and can be undone, or is silently refused as already linked', async ({
  page,
}) => {
  const username = `connections-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')
  await login(page, username, 'correct-horse-battery-staple')
  // login() doesn't itself wait for the post-submit redirect - a goto() right after can otherwise
  // race the session cookie actually being set and bounce off /profile/connections' own auth gate.
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/connections')
  const oidcRow = page.getByRole('listitem').filter({ hasText: 'Openid Connect' })
  await expect(oidcRow.getByText('Not connected')).toBeVisible()

  // exact: true throughout this row - getByText/getByRole name matching is a case-insensitive
  // substring by default, and "Connected" is a substring of "Not connected" (as is "Connect" of
  // "Disconnect"), so a loose match here could silently pass against the opposite state.
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

  // No toast, no error banner on either outcome here - a rejected connect isn't surfaced by
  // ConnectionsList at all, so "Connected" never appearing within a beat is itself the signal
  // that this run hit the already-linked case rather than a real success.
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
