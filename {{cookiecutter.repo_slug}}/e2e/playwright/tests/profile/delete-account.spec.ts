import { expect, test } from '@playwright/test'

import { act, login, signUpAndVerify } from '../helpers'
import { waitForEmailCount, waitForLatestEmailTo } from '../mailpit'

const PASSWORD = 'correct-horse-battery-staple'

test('asking to delete an account signs it out and mails the date; signing back in keeps it', async ({ page }) => {
  const username = `leaver-${Date.now()}`
  const email = `${username}@example.test`
  await signUpAndVerify(page, username, email, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/details')
  await act(
    page,
    PASSWORD,
    async () => {
      await page.getByRole('button', { name: 'Delete my account' }).click()
      await page.getByRole('button', { name: 'Yes, delete my account' }).click()
    },
    page.getByText('Your account will be deleted')
  )
  await expect(page).toHaveURL(/\/auth\/deletion-scheduled\?on=/)
  await waitForEmailCount(email, 2)
  expect((await waitForLatestEmailTo(email)).Text).toContain('Sign in before then and your account stays')

  // Every session is over: the profile now asks them to sign in.
  await page.goto('/profile/details')
  await expect(page).toHaveURL(/\/auth\/login/)

  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
  await waitForEmailCount(email, 3)
  expect((await waitForLatestEmailTo(email)).Text).toContain('which cancelled its deletion')
})
