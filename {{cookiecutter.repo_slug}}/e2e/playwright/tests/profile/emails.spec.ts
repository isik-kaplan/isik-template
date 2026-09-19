import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'
import { extractLinkFromEmail } from '../mailpit'

test('adding, verifying, promoting, and removing a secondary email all work end to end', async ({ page }) => {
  const username = `emails-${Date.now()}`
  const primaryEmail = `${username}@example.test`
  const secondaryEmail = `${username}-secondary@example.test`
  await signUpAndVerify(page, username, primaryEmail, 'correct-horse-battery-staple')
  await login(page, username, 'correct-horse-battery-staple')
  // login() doesn't itself wait for the post-submit redirect - a goto() right after can otherwise
  // race the session cookie actually being set and bounce off /profile/emails' own auth gate.
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/profile/emails')
  // The profile header above the list also shows the primary address, so scope to the list itself
  // (there's exactly one <ul>) to keep this a single-element match.
  const emailsList = page.getByRole('list')
  await expect(emailsList.getByText(primaryEmail)).toBeVisible()

  await page.getByPlaceholder('Email').fill(secondaryEmail)
  await page.getByRole('button', { name: 'Add email' }).click()
  const secondaryRow = page.getByRole('listitem').filter({ hasText: secondaryEmail })
  await expect(secondaryRow.getByText('Unverified')).toBeVisible()

  await secondaryRow.getByRole('button', { name: 'Email actions' }).click()
  await page.getByText('Resend verification').click()
  await expect(page.getByText('Verification email sent.')).toBeVisible()

  const verifyLink = await extractLinkFromEmail(secondaryEmail, '/auth/verify-email/')
  await page.goto(verifyLink)
  await page.getByRole('button', { name: 'Confirm email address' }).click()
  // Already authenticated, so a valid key sends this straight home rather than to /auth/login.
  await expect(page).toHaveURL('/')

  await page.goto('/profile/emails')
  // exact: true - getByText matching is a case-insensitive substring by default, and "Verified"
  // is a substring of "Unverified", so a loose match here could pass against either badge state.
  await expect(secondaryRow.getByText('Verified', { exact: true })).toBeVisible()

  await secondaryRow.getByRole('button', { name: 'Email actions' }).click()
  await page.getByText('Make primary').click()
  await expect(page.getByText('Email set as primary.')).toBeVisible()
  await expect(secondaryRow.getByText('Primary')).toBeVisible()

  const primaryRow = page.getByRole('listitem').filter({ hasText: primaryEmail })
  await primaryRow.getByRole('button', { name: 'Email actions' }).click()
  await page.getByText('Remove').click()
  await expect(page.getByText('Email removed.')).toBeVisible()
  // Scoped to the list, not the whole page - the profile header above it still shows whichever
  // email was primary as of the last full navigation, which is stale by design (see the layout's
  // own comment on getSession()) and would make a page-wide text search flaky here.
  await expect(page.getByRole('listitem').filter({ hasText: primaryEmail })).toHaveCount(0)
})
