import { expect, test } from '@playwright/test'
{%- if cookiecutter.phone == "required" %}

import { LOGIN_LABEL, login, proveWithPassword, signUpAndVerify, submitSignup } from '../helpers'
import { extractLinkFromEmail } from '../mailpit'
{%- else %}

import { login, proveWithPassword, signUpAndVerify } from '../helpers'
{%- endif %}
import { aNumber, codeTextedTo } from '../sms'

const PASSWORD = 'correct-horse-battery-staple'
{%- if cookiecutter.phone == "required" %}

test('the number a signup verified signs in with the password', async ({ page }) => {
  const username = `phone-login-${Date.now()}`
  const email = `${username}@example.test`
  const number = await submitSignup(page, username, email, PASSWORD)
  await page.goto(await extractLinkFromEmail(email, '/auth/verify-email/'))
  await page.getByRole('button', { name: 'Confirm email address' }).click()
  await expect(page).toHaveURL('/auth/login')

  await page.getByLabel(LOGIN_LABEL).fill(number)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
})

test('a mistyped number is corrected at the code step, and the right one texted', async ({ page }) => {
  const username = `phone-typo-${Date.now()}`
  const [mistyped, meant] = [aNumber(), aNumber()]
  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Phone number').fill(mistyped)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/auth/verify-phone')

  await page.getByRole('button', { name: 'Wrong number?' }).click()
  await page.getByLabel('Phone number').fill(meant)
  await page.getByRole('button', { name: 'Text this number instead' }).click()
  await expect(page.getByText('We texted a code to the new number.')).toBeVisible()
  await page.getByLabel('Code').fill(await codeTextedTo(meant))
  await page.getByRole('button', { name: 'Verify' }).click()

  await expect(page).toHaveURL('/auth/signup-email-sent')
})
{%- endif %}

test('a new number asks who you are, is texted a code, and is saved once the code comes back', async ({ page }) => {
  const username = `phone-change-${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
  const number = aNumber()

  await page.goto('/profile/phone')
  await page.getByLabel('Phone number').fill(number)
  await page.getByRole('button', { name: /^(Add|Change) number$/ }).click()
  // Signing in is not a proof, so the change asks for one first and comes back to be made again.
  await proveWithPassword(page, PASSWORD)
  await expect(page).toHaveURL('/profile/phone')
  await page.getByLabel('Phone number').fill(number)
  await page.getByRole('button', { name: /^(Add|Change) number$/ }).click()
  await expect(page.getByText(`We texted a code to ${number}.`)).toBeVisible()

  await page.getByLabel('Code').fill(await codeTextedTo(number))
  await page.getByRole('button', { name: 'Verify' }).click()

  await expect(page.getByText('Phone number saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByText(number)).toBeVisible()
  await expect(page.getByText('Verified')).toBeVisible()
})
