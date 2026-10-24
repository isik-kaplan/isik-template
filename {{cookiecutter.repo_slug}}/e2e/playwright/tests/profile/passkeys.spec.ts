import type { CDPSession, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { act, signUpAndVerify } from '../helpers'
import { readRecoveryCodes } from '../mfa'

// WebAuthn needs a secure context, so this spec runs over the self-signed https listener.
// Signup stays on http, where the verification email links; the session cookie covers both.
test.use({ ignoreHTTPSErrors: true })

const HTTPS = 'https://{{ cookiecutter.domain }}'

const PASSWORD = 'correct-horse-battery-staple'

async function login(page: Page, username: string, password: string) {
  await page.goto(`${HTTPS}/auth/login`)
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** Chromium's virtual authenticator, so the browser half of the ceremony is real rather than stubbed. */
async function attachAuthenticator(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page)
  await session.send('WebAuthn.enable')
  await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return session
}

test('a passkey enrolled as a second factor answers the login challenge, and removing it ends the challenge', async ({
  page,
}) => {
  const session = await attachAuthenticator(page)
  const username = `passkey-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto(`${HTTPS}/profile/two-factor`)
  // Signing in is not a proof, so adding one asks for the password first and then goes ahead.
  await act(
    page,
    PASSWORD,
    () => page.getByRole('button', { name: 'Add a passkey' }).click(),
    page.getByText('Passkey added.')
  )
  // A first factor brings recovery codes, shown once.
  expect(await readRecoveryCodes(page)).toHaveLength(10)
  const remove = page.getByRole('button', { name: /^Remove / })
  await expect(remove).toHaveCount(1)
  await page.reload()
  await expect(remove).toHaveCount(1)

  // A passkey is never a way in on its own: the password comes first, the passkey second.
  await page.context().clearCookies()
  await login(page, username, PASSWORD)
  await expect(page).toHaveURL(/\/auth\/two-factor/)
  await page.getByRole('button', { name: 'Use a passkey' }).click()
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto(`${HTTPS}/profile/two-factor`)
  await act(page, PASSWORD, () => remove.click(), page.getByText('Passkey removed.'))
  await expect(remove).toHaveCount(0)

  await page.context().clearCookies()
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await session.send('WebAuthn.disable')
})

test('a browser without WebAuthn is told so rather than offered a dead button', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
  })
  const username = `nopasskey-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto(`${HTTPS}/profile/two-factor`)
  await expect(page.getByText("This browser can't use passkeys.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a passkey' })).toBeHidden()
})
