import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

test('details open read-only, save names through Edit, and the change shows in the account history', async ({
  page,
}) => {
  const username = `details-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')
  await login(page, username, 'correct-horse-battery-staple')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/details')
  // Read first: no field to type into until Edit is pressed.
  await expect(page.getByText('Not set').first()).toBeVisible()
  await expect(page.getByLabel('First name')).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('First name').fill('Ada')
  await page.getByLabel('Last name').fill('Lovelace')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(page.getByText('Ada', { exact: true })).toBeVisible()
  await expect(page.getByText('Lovelace', { exact: true })).toBeVisible()

  // Saved for real, not only held in the page: a fresh load reads it back from the API.
  await page.reload()
  await expect(page.getByText('Lovelace', { exact: true })).toBeVisible()
  const history = page.getByRole('list').filter({ hasText: 'Account created' })
  await expect(history.getByRole('listitem').filter({ hasText: 'Account updated' }).first()).toContainText(
    'First name'
  )

  await page.getByLabel('Change').selectOption({ label: 'Account created' })
  await expect(page).toHaveURL(/action=insert/)
  await expect(page.getByRole('listitem').filter({ hasText: 'Account updated' })).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: 'Account created' })).toHaveCount(1)
})

test('cancelling an edit throws the typed names away', async ({ page }) => {
  const username = `details-cancel-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')
  await login(page, username, 'correct-horse-battery-staple')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/details')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('First name').fill('Mallory')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await expect(page.getByText('Mallory')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Mallory')).toHaveCount(0)
})
