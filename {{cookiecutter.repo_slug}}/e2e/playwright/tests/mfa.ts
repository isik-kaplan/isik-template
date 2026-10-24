import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { proveWithPassword } from './helpers'
import { freshTotpCode } from './totp'

/** Types into the first box of the one-box-per-digit input, as a person would. */
export async function typeCode(page: Page, code: string) {
  await page.getByLabel('Digit 1 of 6').click()
  await page.keyboard.type(code)
}

export async function readRecoveryCodes(page: Page): Promise<string[]> {
  const list = page.getByTestId('recovery-codes')
  await expect(list).toBeVisible()
  return list.getByRole('listitem').allTextContents()
}

/** No secret is shown until somebody has proved it is them, so that comes first. */
export async function enrollTotp(page: Page, password: string) {
  await page.goto('/profile/two-factor')
  await page.getByRole('link', { name: 'Turn on' }).click()
  await proveWithPassword(page, password)
  await expect(page).toHaveURL('/profile/two-factor')
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim()
  const code = await freshTotpCode(secret)
  await typeCode(page, code)
  await page.getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByText('Two-factor authentication is on.')).toBeVisible()
  const recoveryCodes = await readRecoveryCodes(page)
  return { secret, spent: [code], recoveryCodes }
}
