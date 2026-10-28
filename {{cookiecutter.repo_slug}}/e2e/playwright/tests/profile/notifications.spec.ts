import { expect, test } from '@playwright/test'

import { act, login, signUpAndVerify } from '../helpers'

const PASSWORD = 'correct-horse-battery-staple'

test('a token somebody makes reaches their inbox, says they made it, and stays read once read', async ({ page }) => {
  const username = `inbox-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/tokens')
  const issued = page.getByRole('status')
  await act(
    page,
    PASSWORD,
    async () => {
      if (await page.getByRole('button', { name: 'New token' }).isVisible()) {
        await page.getByRole('button', { name: 'New token' }).click()
      }
      await page.getByLabel('Name', { exact: true }).fill('Deploys')
      await page.getByRole('button', { name: 'Make token' }).click()
    },
    issued.getByText('Copy your token now')
  )

  // The trigger wrote the notice with the token; nothing in the app asked for it.
  await page.goto('/profile/notifications')
  const notice = page.getByRole('listitem').filter({ hasText: 'A personal access token named "Deploys" was created.' })
  await expect(notice).toContainText('By you')
  await notice.getByRole('button', { name: 'Mark read' }).click()
  await expect(notice.getByRole('button', { name: 'Mark read' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Mark read' })).toHaveCount(0)
})
