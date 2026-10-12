import { type Page, expect, test } from '@playwright/test'

import { createHash, randomBytes } from 'node:crypto'

import { login, proveWithPassword, signUpAndVerify } from '../helpers'

// Never served by anything: the browser's arrival there, code in hand, is answered by the spec itself.
const REDIRECT_URI = 'https://client.{{ cookiecutter.domain }}/callback'
const PASSWORD = 'correct-horse-battery-staple'

async function registerApplication(page: Page): Promise<{ clientId: string; clientSecret: string }> {
  const fill = async () => {
    await page.getByLabel('Name').fill('Acme Notes')
    await page.getByLabel('Redirect URIs, one per line').fill(REDIRECT_URI)
    await page.getByRole('button', { name: 'Register app' }).click()
  }
  await page.goto('/profile/applications')
  await fill()
  // Registering is an act: proven, the page comes back empty, and the same registration goes again.
  await proveWithPassword(page, PASSWORD)
  await fill()

  const issued = page.getByRole('status')
  await expect(issued.getByText('Copy the client secret now')).toBeVisible()
  const values = await issued.locator('dd').allTextContents()
  return { clientId: values[0], clientSecret: values[1] }
}

// The whole of "Sign in with" this project, from both ends: somebody registers an application, a
// signed-out visitor is sent through sign-in and the consent page, the application trades the code for
// tokens and reads who signed in, and shutting it out from the profile leaves its token worth nothing.
test('an application signs somebody in, reads who they are, and is shut out again', async ({ page, browser }) => {
  const username = `oauth-${Date.now()}`
  const email = `${username}@example.test`
  await signUpAndVerify(page, username, email, PASSWORD)
  await login(page, username, PASSWORD)
  await expect(page.getByText(`Signed in as ${username}.`)).toBeVisible()
  const { clientId, clientSecret } = await registerApplication(page)

  const authOrigin = new URL(page.url()).origin.replace('://', '://auth.')
  const verifier = randomBytes(32).toString('base64url')
  const authorize = new URL(`${authOrigin}/o/authorize/`)
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    state: 'the-state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()

  // Somebody else's browser, signed out: sign-in first, then straight back to the question.
  const visitor = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
  await visitor.route(`${REDIRECT_URI}**`, (route) => route.fulfill({ status: 200, body: 'back at the application' }))
  await visitor.goto(authorize.href)
  await expect(visitor).toHaveURL(/\/auth\/login\?next=/)
  await visitor.getByLabel('Username or email').fill(username)
  await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await visitor.getByRole('button', { name: 'Log in' }).click()

  await expect(visitor).toHaveURL(/\/auth\/oauth\/authorize\?/)
  await expect(visitor.getByText('Sign in to Acme Notes')).toBeVisible()
  await expect(visitor.getByText('See your email address')).toBeVisible()
  await visitor.getByRole('button', { name: 'Allow' }).click()

  await expect(visitor).toHaveURL(new RegExp(`^${REDIRECT_URI}\\?`))
  const returned = new URL(visitor.url()).searchParams
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
  const userinfo = () =>
    page.request.get(`${authOrigin}/o/userinfo/`, { headers: { Authorization: `Bearer ${accessToken}` } })
  expect(await (await userinfo()).json()).toMatchObject({ email, preferred_username: username })

  // Back at the profile of the account it signed into: it is listed, and removing it is an act too.
  await page.goto('/profile/applications')
  const row = page.getByRole('listitem').filter({ hasText: 'Acme Notes' }).filter({ hasText: 'Since' })
  await row.getByRole('button', { name: 'Remove access' }).click()
  await proveWithPassword(page, PASSWORD)
  await page.getByRole('listitem').filter({ hasText: 'Since' }).getByRole('button', { name: 'Remove access' }).click()
  await expect(page.getByText('Access removed.')).toBeVisible()
  await expect(page.getByText('No app can see your account.')).toBeVisible()

  expect((await userinfo()).status()).toBe(401)
})
