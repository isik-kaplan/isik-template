import type { APIRequestContext } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'

const PASSWORD = 'correct-horse-battery-staple'
const API = 'http://api.{{ cookiecutter.domain }}'

async function ownId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API}/v0/users/me/`)
  expect(response.status()).toBe(200)
  return (await response.json()).id
}

// An account's history says when its password changed and from where - its owner's to read (and
// staff's), not every visitor's.
test("an account history is its owner's to read, and refused to anybody else and to nobody signed in", async ({
  page,
  browser,
}) => {
  const owner = `history-owner-${Date.now()}`
  await signUpAndVerify(page, owner, `${owner}@example.test`, PASSWORD)
  await login(page, owner, PASSWORD)
  await expect(page.getByText(`Signed in as ${owner}.`)).toBeVisible()
  const ownerId = await ownId(page.request)

  const own = await page.request.get(`${API}/v0/users/${ownerId}/history/`)
  expect(own.status()).toBe(200)
  expect((await own.json()).results.some((event: { username: string }) => event.username === owner)).toBe(true)
  const everybody = await (await page.request.get(`${API}/v0/users/history/`)).json()
  expect(everybody.results.every((event: { id: string }) => event.id === ownerId)).toBe(true)

  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  const stranger = `history-other-${Date.now()}`
  await signUpAndVerify(other, stranger, `${stranger}@example.test`, PASSWORD)
  await login(other, stranger, PASSWORD)
  await expect(other.getByText(`Signed in as ${stranger}.`)).toBeVisible()
  expect((await other.request.get(`${API}/v0/users/${ownerId}/history/`)).status()).toBe(403)
  await otherContext.close()

  const anonymousContext = await browser.newContext()
  const anonymous = anonymousContext.request
  expect((await anonymous.get(`${API}/v0/users/${ownerId}/history/`)).status()).toBe(403)
  expect((await anonymous.get(`${API}/v0/users/history/`)).status()).toBe(403)
  await anonymousContext.close()
})
