import { expect, test } from '@playwright/test'

import { signUpAndVerify } from '../helpers'
import { DOCUMENTS, englishText, firstLine } from '../legal'

const ADMIN = 'http://admin.{{ cookiecutter.domain }}'
const SUPERUSER = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__USERNAME ?? ''
const SUPERUSER_PASSWORD = process.env.{{ cookiecutter.config_prefix }}__SETUP__SUPERUSER__PASSWORD ?? ''

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

  const admin = await (await browser.newContext()).newPage()
  await admin.goto(`${ADMIN}/`)
  await admin.getByLabel('Username').fill(SUPERUSER)
  await admin.getByLabel('Password').fill(SUPERUSER_PASSWORD)
  await admin.getByRole('button', { name: 'Log in' }).click()
  await admin.waitForURL(`${ADMIN}/`)
  await admin.goto(`${ADMIN}/users/user/?q=${username}`)
  await admin.getByRole('link', { name: username, exact: true }).click()

  const version = admin.locator('.field-terms_version .readonly')
  const acceptedAt = admin.locator('.field-terms_accepted_at .readonly')
  if (DOCUMENTS.some(({ slug }) => englishText(slug))) {
    await expect(version).toHaveText(/^[0-9a-f]{12}$/)
    await expect(acceptedAt).not.toHaveText('-')
  } else {
    // Nothing was published, so there was nothing to agree to.
    await expect(version).toHaveText('-')
    await expect(acceptedAt).toHaveText('-')
  }
  await admin.context().close()
})
