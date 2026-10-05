import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'
import { enrollTotp, readRecoveryCodes, typeCode } from '../mfa'
import { freshTotpCode } from '../totp'

const PASSWORD = 'correct-horse-battery-staple'

async function signedInUser(page: Page, prefix: string) {
  const username = `${prefix}-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
  return username
}

// Logging out through the UI is logout.spec.ts's business; dropping the cookies is the same thing
// to the server and keeps these specs about the second factor.
async function logInAgain(page: Page, username: string) {
  await page.context().clearCookies()
  await login(page, username, PASSWORD)
}

test('enrolling an authenticator app makes the next login ask for its code', async ({ page }) => {
  // Two codes from one secret can be up to a 30-second step apart.
  test.setTimeout(120_000)
  const username = await signedInUser(page, 'totp')
  const { secret, spent, recoveryCodes } = await enrollTotp(page)
  expect(recoveryCodes).toHaveLength(10)
  await page.reload()
  await expect(page.getByText('On', { exact: true })).toBeVisible()
  await expect(page.getByText('10 of 10 codes left.')).toBeVisible()

  await logInAgain(page, username)
  await expect(page).toHaveURL(/\/auth\/two-factor/)
  // The password alone opened nothing: the session is still anonymous until the code is in.
  await page.goto('/profile/details')
  await expect(page).toHaveURL(/\/auth\/login/)

  await logInAgain(page, username)
  await expect(page).toHaveURL(/\/auth\/two-factor/)
  await typeCode(page, '000000')
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByText('Incorrect code.')).toBeVisible()

  const code = await freshTotpCode(secret, spent)
  // Pasted whole over the wrong one, the way a code copied out of an app arrives.
  await page.getByLabel('Digit 1 of 6').focus()
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text', text)
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, code)
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})

test('a recovery code gets in once, a new set replaces the old, and turning TOTP off ends the challenge', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const username = await signedInUser(page, 'recovery')
  const { recoveryCodes } = await enrollTotp(page)

  await logInAgain(page, username)
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await page.getByLabel('Recovery code').fill(recoveryCodes[0])
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/two-factor')
  await expect(page.getByText('9 of 10 codes left.')).toBeVisible()
  await page.getByRole('button', { name: 'Generate new codes' }).click()
  await expect(page.getByText('New recovery codes generated. The old ones no longer work.')).toBeVisible()
  const regenerated = await readRecoveryCodes(page)
  expect(regenerated).toHaveLength(10)
  expect(regenerated).not.toContain(recoveryCodes[1])

  // The old set is dead the moment the new one exists.
  await logInAgain(page, username)
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await page.getByLabel('Recovery code').fill(recoveryCodes[1])
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByText('Incorrect code.')).toBeVisible()
  await page.getByLabel('Recovery code').fill(regenerated[0])
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/two-factor')
  await page.getByRole('button', { name: 'Turn off' }).click()
  await expect(page.getByText('Authenticator app removed.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible()
  // With no factor left, recovery codes go too - there is nothing for them to recover.
  await expect(page.getByText(/codes left/)).toBeHidden()

  await logInAgain(page, username)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})

test('somebody with an authenticator app can prove it is them with its code instead of the password', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signedInUser(page, 'prove-totp')
  // Turning it on is an act, and spends the proof signing in gave - so the next change asks again.
  const { secret, spent } = await enrollTotp(page)

  await page.goto('/profile/two-factor')
  await page.getByRole('button', { name: 'Generate new codes' }).click()
  await expect(page).toHaveURL('/auth/prove?next=%2Fprofile%2Ftwo-factor')
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

  await typeCode(page, await freshTotpCode(secret, spent))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page).toHaveURL('/profile/two-factor')
  await page.getByRole('button', { name: 'Generate new codes' }).click()
  await expect(page.getByText('New recovery codes generated. The old ones no longer work.')).toBeVisible()
})
