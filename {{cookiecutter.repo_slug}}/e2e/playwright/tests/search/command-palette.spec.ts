import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { asTheSuperuser, signUpAndVerify } from '../helpers'

// The only place the palette meets a real API document, queryset and permission check: every unit test
// stubs the clients below the component.
const PASSWORD = 'correct-horse-battery-staple'
const PHONE = { width: 390, height: 844 }

// By its own name: a listing's filter on the page is a search box too.
const palette = (page: Page) => page.getByRole('dialog').getByLabel('Find a page or a record')

// `/` is ignored while the caret is in a field, so focus leaves any field first.
async function openWithSlash(page: Page) {
  await page.getByRole('heading').first().click()
  await page.keyboard.press('/')
}

test.setTimeout(120_000)

test('slash opens the palette with the caret already in it, and a page is a word away', async ({ browser }) => {
  const page = await asTheSuperuser(browser)
  await page.goto('/profile')

  await openWithSlash(page)
  await expect(palette(page)).toBeFocused()
  await palette(page).fill('people')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/staff\/people$/)
})

test('finds a person and narrows by a field the API declares', async ({ page, browser }) => {
  const person = `palette-${Date.now()}`
  await signUpAndVerify(page, person, `${person}@example.test`, PASSWORD)
  const staff = await asTheSuperuser(browser)
  await staff.goto('/profile')

  await openWithSlash(staff)
  await palette(staff).fill(person)
  await staff.getByRole('listbox').getByRole('button', { name: new RegExp(person) }).click()
  await expect(staff).toHaveURL(/\/staff\/people\/[0-9a-f-]+$/)

  await openWithSlash(staff)
  await palette(staff).fill(`is_staff:true ${person}`)
  await expect(staff.getByText(`Nothing matches “is_staff:true ${person}”.`)).toBeVisible()
  await palette(staff).fill(`is_staff:false ${person}`)
  await expect(staff.getByRole('listbox').getByRole('button', { name: new RegExp(person) })).toBeVisible()
})

test('a field nothing declares is named back rather than searched for', async ({ browser }) => {
  const page = await asTheSuperuser(browser)
  await page.goto('/profile')

  await openWithSlash(page)
  await palette(page).fill('shoe_size:42')

  await expect(page.getByText(/Nothing here can be narrowed by shoe_size\./)).toBeVisible()
})

test('a phone, with no keyboard to press slash with, reaches it from the header', async ({ browser }) => {
  const page = await asTheSuperuser(browser)
  await page.setViewportSize(PHONE)
  await page.goto('/profile')

  await page.getByRole('button', { name: 'Search' }).click()

  await expect(palette(page)).toBeFocused()
  await expect(page.getByRole('listbox')).toBeVisible()
})
