import { expect, test } from '@playwright/test'

import { act, login, signUpAndVerify } from '../helpers'

const PASSWORD = 'correct-horse-battery-staple'

test('a setting is kept beyond a reload, and one guarding the account asks who it is first', async ({ page }) => {
  const username = `settings-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/settings')
  const lifetime = page.getByLabel('Token lifetime')
  await expect(lifetime).toHaveValue('30')
  await lifetime.fill('60')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Token lifetime')).toHaveValue('60')

  const twoFactor = page.getByLabel('Keep two-factor sign-in')
  await act(
    page,
    PASSWORD,
    async () => {
      if (!(await twoFactor.isChecked())) await twoFactor.click()
    },
    page.getByText('Saved.')
  )
  await page.reload()
  await expect(page.getByLabel('Keep two-factor sign-in')).toBeChecked()
})
