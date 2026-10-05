import { expect, test } from '@playwright/test'

import { login, proveWithPassword, signUpAndVerify } from '../helpers'

// The re-authentication gate, driven rather than around: an act the backend refuses until somebody
// proves it is them sends them to the prove page and back, and the proof buys exactly one act.
test('an act asks for the password again, comes back to finish, and the proof buys only that act', async ({
  page,
}) => {
  const username = `reauth-${Date.now()}`
  const password = 'correct-horse-battery-staple'
  await signUpAndVerify(page, username, `${username}@example.test`, password)
  await login(page, username, password)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  // Typing the password to sign in is itself a proof - the first act spends it.
  await page.goto('/profile/emails')
  await page.getByPlaceholder('Email').fill(`${username}-first@example.test`)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: `${username}-first@example.test` })).toBeVisible()

  await page.getByPlaceholder('Email').fill(`${username}-second@example.test`)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page).toHaveURL('/auth/prove?next=%2Fprofile%2Femails')
  await expect(page.getByText("Confirm it's you", { exact: true })).toBeVisible()

  await page.getByLabel('Password', { exact: true }).fill('definitely-not-it')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText('Incorrect password.')).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/prove/)

  await proveWithPassword(page, password)
  await expect(page).toHaveURL('/profile/emails')
  await page.getByPlaceholder('Email').fill(`${username}-second@example.test`)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: `${username}-second@example.test` })).toBeVisible()

  // Single-use: the next act asks again, and walking away from the prove page changes nothing.
  await page.getByPlaceholder('Email').fill(`${username}-third@example.test`)
  await page.getByRole('button', { name: 'Add email' }).click()
  await expect(page).toHaveURL(/\/auth\/prove/)
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL('/profile/emails')
  await expect(page.getByRole('listitem').filter({ hasText: `${username}-third@example.test` })).toHaveCount(0)
})
