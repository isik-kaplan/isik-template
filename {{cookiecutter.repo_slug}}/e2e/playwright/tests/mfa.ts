import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { freshTotpCode } from './totp'

/** Types a code into the one-box-per-digit input, the way a person would: into the first box. */
export async function typeCode(page: Page, code: string) {
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(code)
}

/** The recovery codes on screen right now - shown once, so a spec that needs one reads it here. */
export async function readRecoveryCodes(page: Page): Promise<string[]> {
  const list = page.getByTestId('recovery-codes')
  await expect(list).toBeVisible()
  return list.getByRole('listitem').allTextContents()
}

/** Turns on TOTP from the profile, answering with the code the secret on screen produces. */
export async function enrollTotp(page: Page) {
  await page.goto('/profile/two-factor')
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim()
  const code = await freshTotpCode(secret)
  await typeCode(page, code)
  await page.getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByText('Two-factor authentication is on.')).toBeVisible()
  const recoveryCodes = await readRecoveryCodes(page)
  return { secret, spent: [code], recoveryCodes }
}
