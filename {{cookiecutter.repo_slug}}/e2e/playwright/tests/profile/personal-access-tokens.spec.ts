import { expect, test } from '@playwright/test'

import { act, login, signUpAndVerify } from '../helpers'

const PASSWORD = 'correct-horse-battery-staple'

test('a personal access token calls the API as its owner until it is deleted', async ({ page, browser }) => {
  const username = `pat-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/tokens')
  await expect(page.getByText('You have no tokens.')).toBeVisible()
  const issued = page.getByRole('status')
  await act(
    page,
    PASSWORD,
    async () => {
      if (await page.getByRole('button', { name: 'New token' }).isVisible()) {
        await page.getByRole('button', { name: 'New token' }).click()
      }
      await page.getByLabel('Name', { exact: true }).fill('Deploys')
      await page.getByLabel('Expires').selectOption('7')
      await page.getByRole('button', { name: 'Make token' }).click()
    },
    issued.getByText('Copy your token now')
  )
  const token = (await issued.locator('code').textContent()) ?? ''
  expect(token).toMatch(/^pat_/)
  await issued.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Deploys' })).toContainText('Never used')

  const apiOrigin = new URL(page.url()).origin.replace('://', '://api.')
  const script = (await browser.newContext({ ignoreHTTPSErrors: true })).request
  const bearer = { headers: { Authorization: `Bearer ${token}` } }
  const people = () => script.get(`${apiOrigin}/v0/users/`, bearer)
  const listed = (await (await people()).json()).results.map((person: { username: string }) => person.username)
  // Only themselves: it was given no permissions.
  expect(listed).toEqual([username])
  // A token may not make another.
  expect((await script.get(`${apiOrigin}/v0/personal-access-tokens/`, bearer)).status()).toBe(403)

  await page.reload()
  const row = page.getByRole('listitem').filter({ hasText: 'Deploys' })
  await expect(row).toContainText('Last used')
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('You have no tokens.')).toBeVisible()

  expect((await people()).status()).toBe(403)
})
