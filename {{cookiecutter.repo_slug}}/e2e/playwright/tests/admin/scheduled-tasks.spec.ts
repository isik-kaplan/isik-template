import { expect, test } from '@playwright/test'

import { ADMIN, signInToAdmin } from '../helpers'

test('staff pause a scheduled task from the admin, and resume it', async ({ browser }) => {
  const page = await signInToAdmin(browser)
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Scheduled tasks' }).click()
  await expect(page).toHaveURL(`${ADMIN}/scheduled-tasks`)
  const task = page.getByRole('listitem').filter({ hasText: 'remove_unverified_accounts' })
  await expect(task).toContainText('At 45 4 * * * (cron, UTC)')

  await task.getByRole('button', { name: 'Pause' }).click()
  await expect(task).toContainText('Paused')

  await task.getByRole('button', { name: 'Resume' }).click()
  await expect(task.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(task).not.toContainText('Paused')
})
