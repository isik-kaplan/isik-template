import { type Page, expect, test } from '@playwright/test'

import { createHash, randomBytes } from 'node:crypto'

import { SUPERUSER, SUPERUSER_PASSWORD, act, asTheSuperuser, login, signUpAndVerify } from '../helpers'

// Never served by anything: the spec reads the code off the browser's request to it.
const REDIRECT_URI = 'https://client.testproject.test/callback'
const PASSWORD = 'correct-horse-battery-staple'
const MANAGE_PEOPLE = "See everybody's account, and activate or deactivate them"

async function registerApplication(page: Page, name: string): Promise<{ clientId: string; clientSecret: string }> {
  await page.goto('/applications/new')
  const issued = page.getByRole('status')
  await act(
    page,
    PASSWORD,
    async () => {
      await page.getByLabel('Name', { exact: true }).fill(name)
      await page.getByLabel('Redirect URIs, one per line').fill(REDIRECT_URI)
      await page.getByRole('checkbox', { name: new RegExp(MANAGE_PEOPLE) }).check()
      await page.getByRole('button', { name: 'Register app' }).click()
    },
    issued.getByText('Copy the client secret now')
  )
  const values = await issued.locator('dd').allTextContents()
  await page.getByRole('link', { name: 'I have copied it, go to the app' }).click()
  await expect(page.getByText('Waiting for approval')).toBeVisible()
  return { clientId: values[0], clientSecret: values[1] }
}

test('an application is approved, signs somebody in, acts for them, and is shut out again', async ({
  page,
  browser,
}) => {
  // Three round trips through the prove page.
  test.setTimeout(90_000)
  const username = `oauth-${Date.now()}`
  const email = `${username}@example.test`
  const name = `Acme Notes ${Date.now()}`
  await signUpAndVerify(page, username, email, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
  const { clientId, clientSecret } = await registerApplication(page, name)

  const superuser = await asTheSuperuser(browser)
  await superuser.goto('/staff/applications?approval=pending')
  await superuser.getByRole('link', { name }).click()
  await act(
    superuser,
    SUPERUSER_PASSWORD,
    () => superuser.getByRole('button', { name: 'Approve' }).click(),
    superuser.getByText('Approved', { exact: true })
  )
  await superuser.goto('/staff/people')
  await superuser.getByRole('link', { name: username, exact: true }).click()
  await act(
    superuser,
    SUPERUSER_PASSWORD,
    async () => {
      await superuser.getByRole('checkbox', { name: new RegExp(MANAGE_PEOPLE) }).check()
      await superuser.getByRole('button', { name: 'Save' }).click()
    },
    superuser.getByText('Saved.')
  )
  await superuser.context().close()

  const authOrigin = new URL(page.url()).origin.replace('://', '://auth.')
  const apiOrigin = new URL(page.url()).origin.replace('://', '://api.')
  const verifier = randomBytes(32).toString('base64url')
  const authorize = new URL(`${authOrigin}/o/authorize/`)
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email users:manage:user',
    state: 'the-state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()

  // A signed-out browser: sign-in first, then back to the consent page.
  const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
  await visitor.goto(authorize.href)
  await expect(visitor).toHaveURL(/\/auth\/login\?next=/)
  await visitor.getByLabel('Username or email').fill(username)
  await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await visitor.getByRole('button', { name: 'Log in' }).click()

  await expect(visitor).toHaveURL(/\/auth\/oauth\/authorize\?/)
  await expect(visitor.getByText(`Sign in to ${name}`)).toBeVisible()
  await expect(visitor.getByText('See your email address')).toBeVisible()
  await expect(visitor.getByText(MANAGE_PEOPLE)).toBeVisible()
  await expect(visitor.getByText(`Not ${username}?`)).toBeVisible()
  // Read off the request: intercepting navigation after a form post's redirect depends on the scheme.
  const returning = visitor.waitForRequest((request) => request.url().startsWith(`${REDIRECT_URI}?`))
  await visitor.getByRole('button', { name: 'Allow' }).click()

  const returned = new URL((await returning).url()).searchParams
  expect(returned.get('state')).toBe('the-state')

  const tokens = await page.request.post(`${authOrigin}/o/token/`, {
    form: {
      grant_type: 'authorization_code',
      code: returned.get('code') ?? '',
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      client_id: clientId,
      client_secret: clientSecret,
    },
  })
  expect(tokens.status()).toBe(200)
  const { access_token: accessToken } = await tokens.json()
  const bearer = { headers: { Authorization: `Bearer ${accessToken}` } }
  // The token alone, none of the browser's cookies.
  const application = (await browser.newContext({ ignoreHTTPSErrors: true })).request
  const userinfo = () => application.get(`${authOrigin}/o/userinfo/`, bearer)
  const people = () => application.get(`${apiOrigin}/v0/users/`, bearer)
  expect(await (await userinfo()).json()).toMatchObject({ email, preferred_username: username })
  const listed = (await (await people()).json()).results.map((person: { username: string }) => person.username)
  expect(listed).toEqual(expect.arrayContaining([username, SUPERUSER]))
  // Not the person's own account settings.
  expect((await application.get(`${apiOrigin}/v0/users/me/`, bearer)).status()).toBe(403)

  await page.goto('/profile/applications')
  await act(
    page,
    PASSWORD,
    () => page.getByRole('listitem').filter({ hasText: 'Since' }).getByRole('button', { name: 'Remove access' }).click(),
    page.getByText('No app can see your account.')
  )

  expect((await userinfo()).status()).toBe(401)
  expect((await people()).status()).toBe(403)
})
