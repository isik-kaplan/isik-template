import { expect, test } from '@playwright/test'

import { ADMIN, signInToAdmin, signUpAndVerify } from '../helpers'
import { DOCUMENTS, englishText, firstLine } from '../legal'


test('every legal document is one footer click away, and shows its text or says it is missing', async ({ page }) => {
  for (const { slug } of DOCUMENTS) {
    await page.goto('/')
    const link = page.getByRole('navigation', { name: 'Legal' }).locator(`a[href="/legal/${slug}"]`)
    const title = (await link.textContent()) ?? ''
    await link.click()

    await expect(page).toHaveURL(`/legal/${slug}`)
    await expect(page.getByRole('tab', { name: title })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeAttached()
    const text = englishText(slug)
    if (text) {
      await expect(page.getByRole('article').getByText(firstLine(text), { exact: true }).first()).toBeVisible()
    } else {
      await expect(page.getByText("This document hasn't been added yet")).toBeVisible()
    }
  }
})

test("the footer's cookie line leads to the disclosure on the document that carries it", async ({ page }) => {
  const disclosing = DOCUMENTS.find((document) => document.disclosesStorage)
  expect(disclosing, 'documents.json names the document that carries the disclosure').toBeTruthy()

  await page.goto('/auth/login')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Cookies and storage' }).click()

  await expect(page).toHaveURL(`/legal/${disclosing!.slug}#cookies`)
  await expect(page.getByRole('region', { name: 'Cookies and storage' })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'sessionid' })).toBeVisible()
})

test('a slug no document has is a 404', async ({ page }) => {
  const response = await page.goto('/legal/no-such-document')

  expect(response?.status()).toBe(404)
  await expect(page.getByText('Page not found')).toBeVisible()
})

test('signing up records which version of the documents the new account agreed to', async ({ page, browser }) => {
  const username = `terms-${Date.now()}`
  await page.goto('/auth/signup')
  const notice = page.getByText(/By continuing, you agree to the/)
  for (const { slug } of DOCUMENTS) {
    await expect(notice.locator(`a[href="/legal/${slug}"]`)).toBeVisible()
  }
  await signUpAndVerify(page, username, `${username}@example.test`, 'correct-horse-battery-staple')

  const admin = await signInToAdmin(browser)
  // Looked up as the admin would, by the address.
  const found = await admin.request.get(`http://api.{{ cookiecutter.domain }}/v0/users/?search=${username}`)
  const [{ id }] = (await found.json()).results
  await admin.goto(`${ADMIN}/people/${id}`)
  const version = admin.getByText('Terms accepted').locator('xpath=following-sibling::dd[1]')
  const acceptedAt = admin.getByText('Accepted at').locator('xpath=following-sibling::dd[1]')
  if (DOCUMENTS.some(({ slug }) => englishText(slug))) {
    await expect(version).toHaveText(/^[0-9a-f]{12}$/)
    await expect(acceptedAt).not.toHaveText('None')
  } else {
    // Nothing was published, so there was nothing to agree to.
    await expect(version).toHaveText('None')
    await expect(acceptedAt).toHaveText('None')
  }
  await admin.context().close()
})
