import { expect, test } from '@playwright/test'

import { login, signUpAndVerify } from '../helpers'
import { STORAGE_ITEMS } from '../legal'

const DOMAIN = '{{ cookiecutter.domain }}'

// No consent banner holds only while everything stored is disclosed in storage.json as necessary or asked for.
test('everything a signed-in visit stores in the browser is in the disclosure list', async ({ page, context }) => {
  const username = `storage-${Date.now()}`
  const password = 'correct-horse-battery-staple'
  await signUpAndVerify(page, username, `${username}@example.test`, password)
  await login(page, username, password)
  await expect(page).toHaveURL('/')

  for (const path of ['/profile/details', '/profile/emails', '/profile/sessions', '/legal/privacy-policy']) {
    await page.goto(path)
  }
  await page.goto('/profile/details')
  await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click()

  const disclosed = (kind: string) => STORAGE_ITEMS.filter((item) => item.kind === kind).map((item) => item.name)
  const cookies = (await context.cookies())
    .filter(({ domain }) => domain.replace(/^\./, '') === DOMAIN || domain.endsWith(`.${DOMAIN}`))
    .map(({ name }) => name)
  const localStorageKeys = await page.evaluate(() => Object.keys(window.localStorage))
  const sessionStorageKeys = await page.evaluate(() => Object.keys(window.sessionStorage))

  expect(cookies.length, 'a signed-in browser holds a session cookie at least').toBeGreaterThan(0)
  expect(cookies.filter((name) => !disclosed('cookie').includes(name)), 'cookies storage.json leaves out').toEqual([])
  expect(
    localStorageKeys.filter((name) => !disclosed('localStorage').includes(name)),
    'local storage keys storage.json leaves out'
  ).toEqual([])
  expect(sessionStorageKeys, 'session storage keys, which storage.json has no kind for yet').toEqual([])
})
