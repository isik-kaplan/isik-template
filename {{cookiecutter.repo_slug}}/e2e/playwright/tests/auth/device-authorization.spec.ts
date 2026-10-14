import { expect, test } from '@playwright/test'

import { SUPERUSER_PASSWORD, act, asTheSuperuser, login, signUpAndVerify } from '../helpers'

const PASSWORD = 'correct-horse-battery-staple'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

// A command line signing somebody in, from every end: somebody registers it as a device, a superuser
// approves it, the device is handed a code, a signed-out visitor follows the link it printed through sign-in
// to the question, and the device's poll comes back with one token acting for them - and only one.
test('a device shows a code, somebody lets it in, and it gets one token for them', async ({ page, browser }) => {
  const username = `device-${Date.now()}`
  const name = `Acme CLI ${Date.now()}`
  await signUpAndVerify(page, username, `${username}@example.test`, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()

  await page.goto('/applications/new')
  await act(
    page,
    PASSWORD,
    async () => {
      await page.getByLabel('Name', { exact: true }).fill(name)
      await page.getByLabel('How it signs people in').selectOption(DEVICE_GRANT)
      await page.getByRole('button', { name: 'Register app' }).click()
    },
    page.getByText('Waiting for approval')
  )
  const clientId =
    (await page.getByText('Client ID', { exact: true }).locator('xpath=following-sibling::dd[1]').textContent()) ?? ''
  expect(clientId).not.toBe('')

  const superuser = await asTheSuperuser(browser)
  await superuser.goto('/staff/applications?approval=pending')
  await superuser.getByRole('link', { name }).click()
  await act(
    superuser,
    SUPERUSER_PASSWORD,
    () => superuser.getByRole('button', { name: 'Approve' }).click(),
    superuser.getByText('Approved', { exact: true })
  )
  await superuser.context().close()

  // The device: no browser, no cookies - a form post and a poll.
  const authOrigin = new URL(page.url()).origin.replace('://', '://auth.')
  const device = (await browser.newContext({ ignoreHTTPSErrors: true })).request
  const asked = await device.post(`${authOrigin}/o/device-authorization/`, {
    form: { client_id: clientId, scope: 'openid' },
  })
  expect(asked.status()).toBe(200)
  const codes = await asked.json()
  const poll = () =>
    device.post(`${authOrigin}/o/token/`, {
      form: {
        grant_type: DEVICE_GRANT,
        device_code: codes.device_code,
        client_id: clientId,
      },
    })
  expect((await (await poll()).json()).error).toBe('authorization_pending')

  // Somebody else's browser, signed out, following the link the device printed.
  const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
  await visitor.goto(codes.verification_uri_complete)
  await expect(visitor).toHaveURL(/\/auth\/login\?next=/)
  await visitor.getByLabel('Username or email').fill(username)
  await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await visitor.getByRole('button', { name: 'Log in' }).click()

  await expect(visitor).toHaveURL(/\/device\?code=/)
  await expect(visitor.getByText(`Let ${name} in?`)).toBeVisible()
  await expect(visitor.getByText(`Check that your device shows ${codes.user_code}.`)).toBeVisible()
  await visitor.getByRole('button', { name: 'Allow' }).click()
  await expect(visitor.getByText('Done. Go back to your device: it is signed in.')).toBeVisible()

  const tokens = await poll()
  expect(tokens.status()).toBe(200)
  const { access_token: accessToken } = await tokens.json()
  const userinfo = await device.get(`${authOrigin}/o/userinfo/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  expect((await userinfo.json()).sub).toBeTruthy()
  // The code bought one token: asking again is told it expired.
  expect((await (await poll()).json()).error).toBe('expired_token')

  // The same code, entered by hand afterwards, is nothing anybody is waiting on.
  await visitor.goto('/device')
  await visitor.getByLabel('Code').fill(codes.user_code)
  await visitor.getByRole('button', { name: 'Continue' }).click()
  await expect(
    visitor.getByText('That code is wrong, has expired or was already used. Start again on the device.')
  ).toBeVisible()
})
