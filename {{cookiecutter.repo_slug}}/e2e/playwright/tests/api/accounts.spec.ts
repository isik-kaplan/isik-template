import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

const PASSWORD = 'correct-horse-battery-staple'
const API = 'http://api.{{ cookiecutter.domain }}'

// Every account carries an email address - its owner's to read (and staff's), never a list anybody
// can page through.
test("an account is its owner's to read, hidden from anybody else and refused to nobody signed in", async ({
  page,
  browser,
}) => {
  const owner = `accounts-owner-${Date.now()}`
  await signUpAndVerify(page, owner, `${owner}@example.test`, PASSWORD)
  await login(page, owner, PASSWORD)
  await expect(page.getByText(`Signed in as ${owner}.`)).toBeVisible()

  const listed = await page.request.get(`${API}/v0/users/`)
  expect(listed.status()).toBe(200)
  const { results } = await listed.json()
  expect(results.map((account: { username: string }) => account.username)).toEqual([owner])
  const ownerId = results[0].id
  expect((await page.request.get(`${API}/v0/users/${ownerId}/`)).status()).toBe(200)

  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  const stranger = `accounts-other-${Date.now()}`
  await signUpAndVerify(other, stranger, `${stranger}@example.test`, PASSWORD)
  await login(other, stranger, PASSWORD)
  await expect(other.getByText(`Signed in as ${stranger}.`)).toBeVisible()
  expect((await other.request.get(`${API}/v0/users/${ownerId}/`)).status()).toBe(404)
  await otherContext.close()

  const anonymousContext = await browser.newContext()
  expect((await anonymousContext.request.get(`${API}/v0/users/`)).status()).toBe(403)
  expect((await anonymousContext.request.get(`${API}/v0/users/${ownerId}/`)).status()).toBe(403)
  await anonymousContext.close()
})

// The cookie lives on the parent domain, so a deletion that names no domain would leave it behind.
test("a dead session's cookie is gone from the browser once the API says it cleared it", async ({ browser }) => {
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'sessionid', value: 'a-session-that-no-longer-exists', domain: '.{{ cookiecutter.domain }}', path: '/' },
  ])

  const response = await context.request.get(`${API}/v0/users/me/`)

  expect(response.status()).toBe(403)
  expect(response.headers()['x-session-cleared']).toBe('1')
  expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain('sessionid')
  await context.close()
})
